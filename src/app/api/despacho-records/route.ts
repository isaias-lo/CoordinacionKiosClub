import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { idsActualizables, type DespachoRow } from '@/features/despacho/rutas/utils/vueltaIntegrity';
import { fechaChile } from '@/lib/fechaChile';

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
 * PATCH /api/despacho-records
 * Body: { fecha: string, updates: { cod, conductor, patente, transporte, ruta, supervisor }[] }
 *
 * Actualiza routing info (conductor, patente, ruta) en despacho_rm Y picking_pallets
 * usando (fecha, cod) como llave — nunca crea registros nuevos.
 * Reemplaza el flujo anterior que insertaba registros con IDs R{ruta}{cod}{stamp}.
 * Protege filas en estados finales (Entregado/Recibido/Diferencia).
 * Además avanza el seguimiento Registrado → Pendiente (asignar = listo para despachar);
 * el conductor lo pasa a 'En camino' al iniciar el recorrido.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as {
      fecha: string;
      table?: 'despacho_rm' | 'despacho_regiones';
      updates: { cod: string; conductor: string; patente: string; transporte: string; ruta: string; supervisor: string; vuelta?: number; pioneta_1?: string | null; pioneta_2?: string | null }[];
    };

    if (!body.fecha || !Array.isArray(body.updates) || body.updates.length === 0) {
      return NextResponse.json({ error: 'fecha y updates requeridos' }, { status: 400 });
    }

    // Tabla destino del routing: RM/Costa → despacho_rm (default), Regiones → despacho_regiones.
    const table = body.table === 'despacho_regiones' ? 'despacho_regiones' : 'despacho_rm';

    const sb = supabaseServer();
    let updatedDespacho = 0;
    let updatedPicking  = 0;
    // Día calendario real en que se registra el despacho (puede diferir de la fecha
    // de SALIDA: armado hoy, sale mañana). Para distinguir "armado vs salida" en reportes.
    const fechaArmado = fechaChile(0);

    // Deduplicar por cod (tomar el primer registro si hay múltiples del mismo cod)
    const seen = new Set<string>();
    for (const upd of body.updates) {
      if (seen.has(upd.cod)) continue;
      seen.add(upd.cod);

      // 1. Actualizar la tabla destino por (fecha, cod) — solo filas no finalizadas.
      // En carga extra (2ª vuelta) se protegen las filas ya despachadas en 1ª vuelta.
      const { data: rmRows } = await sb
        .from(table)
        .select('id, seguimiento, conductor, vuelta')
        .eq('fecha', body.fecha)
        .eq('cod', upd.cod);

      const esCargaExtra = upd.vuelta === 2;
      const ids = idsActualizables((rmRows ?? []) as DespachoRow[], upd.vuelta);

      if (ids.length > 0) {
        const { error } = await sb
          .from(table)
          .update({
            conductor:   upd.conductor,
            patente:     upd.patente,
            transporte:  upd.transporte,
            ruta:        upd.ruta,
            supervisor:  upd.supervisor,
            estado:      'Listo para despachar',
            fecha_armado: fechaArmado,
            ...(upd.vuelta     !== undefined && { vuelta:     upd.vuelta }),
            ...(upd.pioneta_1  !== undefined && { pioneta_1:  upd.pioneta_1 }),
            ...(upd.pioneta_2  !== undefined && { pioneta_2:  upd.pioneta_2 }),
          })
          .in('id', ids);
        if (error) console.error(`[despacho-records PATCH] ${table}:`, error.message);
        else updatedDespacho += ids.length;

        // Avanzar Registrado → Pendiente: asignar patente/ruta = asignado y listo, pendiente
        // de que el conductor "inicie recorrido" (→ 'En camino'). Solo toca filas aún en
        // 'Registrado' — nunca regresa En camino/Entregado/Recibido/Diferencia.
        await sb.from(table).update({ seguimiento: 'Pendiente' }).in('id', ids).eq('seguimiento', 'Registrado');
      }

      // 2. Actualizar picking_pallets activos por (date≈fecha, store_cod, is_active)
      // Convertir fecha DD/MM/YYYY → YYYY-MM-DD para la tabla picking_pallets
      const parts = body.fecha.split('/');
      const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : body.fecha;

      let pkQuery = sb
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

      // Carga extra (2ª vuelta): no relabelar pallets ya despachados en 1ª vuelta.
      if (esCargaExtra) pkQuery = pkQuery.is('conductor', null);

      const { error: pkErr } = await pkQuery;

      if (pkErr) console.error('[despacho-records PATCH] picking_pallets:', pkErr.message);
      else updatedPicking++;
    }

    return NextResponse.json({ ok: true, updatedDespacho, updatedPicking });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
