import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';

const ALLOWED_TABLES = new Set(['despacho_rm', 'despacho_regiones', 'recepcion']);

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table') ?? '';

  if (!ALLOWED_TABLES.has(table)) {
    return NextResponse.json({ error: 'tabla no permitida' }, { status: 400 });
  }

  const sb = supabaseServer();
  const { data, error } = await sb
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

/**
 * POST /api/despacho-records
 * Body: { table: 'despacho_rm' | 'despacho_regiones', records: object[] }
 *
 * Upserts records directamente en Supabase.
 * Se usa para escribir registros RM en el mismo momento del despacho
 * (con seguimiento = 'En camino'), evitando la race condition de
 * escribir a Sheets primero y esperar la sincronización.
 *
 * La política de conflicto: si el registro ya existe (mismo id) Y su
 * seguimiento actual es un estado avanzado ('Entregado','Recibido','Diferencia'),
 * el campo seguimiento no se sobreescribe. Para el resto de campos sí.
 */
export async function POST(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const body = await request.json() as { table?: string; records?: object[] };
    const { table = '', records = [] } = body;

    if (!ALLOWED_TABLES.has(table)) {
      return NextResponse.json({ error: 'tabla no permitida' }, { status: 400 });
    }
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'records vacío' }, { status: 400 });
    }

    const sb = supabaseServer();

    // Separar registros en dos grupos: nuevos vs existentes
    // Usamos upsert con ignoreDuplicates=false para que los registros
    // ya existentes con estados intermedios (Registrado, Pendiente)
    // se actualicen a 'En camino', pero sin tocar los que ya están
    // en estados finales.
    const ids = (records as { id?: string }[]).map(r => r.id).filter(Boolean) as string[];

    // 1. Obtener los que ya existen y están en estado final
    const { data: existentes } = await sb
      .from(table)
      .select('id, seguimiento')
      .in('id', ids);

    const estadosFinales = new Set(['Entregado', 'Recibido', 'Diferencia']);
    const idsProtegidos = new Set(
      ((existentes ?? []) as { id: string; seguimiento: string }[])
        .filter(r => estadosFinales.has(r.seguimiento))
        .map(r => r.id)
    );

    // 2. Upsert solo los registros que no están en estado final
    const recordsToUpsert = (records as { id?: string }[]).filter(r => !idsProtegidos.has(r.id ?? ''));
    if (recordsToUpsert.length === 0) {
      return NextResponse.json({ ok: true, upserted: 0, skipped: ids.length });
    }

    const { error } = await sb
      .from(table)
      .upsert(recordsToUpsert, { onConflict: 'id' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, upserted: recordsToUpsert.length, skipped: idsProtegidos.size });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * PATCH /api/despacho-records
 * Body: { fecha: string, updates: { cod, conductor, patente, transporte, ruta, supervisor }[] }
 *
 * Actualiza routing info (conductor, patente, ruta) en despacho_rm Y picking_pallets
 * usando (fecha, cod) como llave — nunca crea registros nuevos.
 * Reemplaza el flujo anterior que insertaba registros con IDs R{ruta}{cod}{stamp}.
 * Protege filas en estados finales (Entregado/Recibido/Diferencia).
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as {
      fecha: string;
      updates: { cod: string; conductor: string; patente: string; transporte: string; ruta: string; supervisor: string; vuelta?: number; pioneta_1?: string | null; pioneta_2?: string | null }[];
    };

    if (!body.fecha || !Array.isArray(body.updates) || body.updates.length === 0) {
      return NextResponse.json({ error: 'fecha y updates requeridos' }, { status: 400 });
    }

    const sb = supabaseServer();
    const estadosFinales = new Set(['Entregado', 'Recibido', 'Diferencia']);
    let updatedDespacho = 0;
    let updatedPicking  = 0;

    // Deduplicar por cod (tomar el primer registro si hay múltiples del mismo cod)
    const seen = new Set<string>();
    for (const upd of body.updates) {
      if (seen.has(upd.cod)) continue;
      seen.add(upd.cod);

      // 1. Actualizar despacho_rm por (fecha, cod) — solo filas no finalizadas
      const { data: rmRows } = await sb
        .from('despacho_rm')
        .select('id, seguimiento')
        .eq('fecha', body.fecha)
        .eq('cod', upd.cod);

      const idsActualizables = ((rmRows ?? []) as { id: string; seguimiento: string }[])
        .filter(r => !estadosFinales.has(r.seguimiento))
        .map(r => r.id);

      if (idsActualizables.length > 0) {
        const { error } = await sb
          .from('despacho_rm')
          .update({
            conductor:   upd.conductor,
            patente:     upd.patente,
            transporte:  upd.transporte,
            ruta:        upd.ruta,
            supervisor:  upd.supervisor,
            estado:      'Listo para despachar',
            ...(upd.vuelta     !== undefined && { vuelta:     upd.vuelta }),
            ...(upd.pioneta_1  !== undefined && { pioneta_1:  upd.pioneta_1 }),
            ...(upd.pioneta_2  !== undefined && { pioneta_2:  upd.pioneta_2 }),
          })
          .in('id', idsActualizables);
        if (error) console.error('[despacho-records PATCH] despacho_rm:', error.message);
        else updatedDespacho += idsActualizables.length;
      }

      // 2. Actualizar picking_pallets activos por (date≈fecha, store_cod, is_active)
      // Convertir fecha DD/MM/YYYY → YYYY-MM-DD para la tabla picking_pallets
      const parts = body.fecha.split('/');
      const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : body.fecha;

      const { error: pkErr } = await sb
        .from('picking_pallets')
        .update({
          conductor:  upd.conductor,
          patente:    upd.patente,
          ruta:       upd.ruta,
          supervisor: upd.supervisor,
        })
        .eq('date', isoDate)
        .eq('store_cod', upd.cod)
        .eq('is_active', true);

      if (pkErr) console.error('[despacho-records PATCH] picking_pallets:', pkErr.message);
      else updatedPicking++;
    }

    return NextResponse.json({ ok: true, updatedDespacho, updatedPicking });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
