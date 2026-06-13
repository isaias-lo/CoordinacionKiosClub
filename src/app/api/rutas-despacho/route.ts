import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { upsertTrazabilidadSheet } from '@/lib/sheetsTraza';
import { verifyAuth } from '@/lib/apiAuth';

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const fecha   = request.nextUrl.searchParams.get('fecha') ?? new Date().toISOString().slice(0, 10);
  const patente = request.nextUrl.searchParams.get('patente');

  let query = supabaseServer()
    .from('rutas_despacho')
    .select('*, ruta_tiendas(*), ruta_guias(*)')
    .eq('fecha', fecha)
    .order('created_at', { ascending: true });

  if (patente) query = query.ilike('patente', patente.trim());

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const body = await request.json() as {
    fecha: string; codigo_ruta: string; chofer: string; patente: string;
    bodega_origen?: string;
    pioneta_1?: string;
    pioneta_2?: string;
    tipo_carga?: string;
    regimen?:    string;
    usuario_creador?: string;
    tiendas?: { store_cod: string; nombre?: string; ventana?: string; orden: number; pallets: number; bultos: number; contenedores?: number }[];
    guias?:   { store_cod?: string; folio_dte: string; drive_url?: string }[];
  };

  const token    = crypto.randomUUID();
  const tokenExp = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const { data: ruta, error: rutaErr } = await supabaseServer()
    .from('rutas_despacho')
    .insert({
      fecha:          body.fecha,
      codigo_ruta:    body.codigo_ruta,
      chofer:         body.chofer,
      chofer_original: body.chofer,  // snapshot at creation
      patente:        body.patente,
      bodega_origen:  body.bodega_origen ?? 'Santiago',
      estado:         'pendiente',
      token_qr:       token,
      token_exp:      tokenExp,
      pioneta_1:      body.pioneta_1 ?? null,
      pioneta_2:      body.pioneta_2 ?? null,
    })
    .select()
    .single();
  if (rutaErr) return NextResponse.json({ error: rutaErr.message }, { status: 500 });

  if (body.tiendas?.length) {
    const { error: tErr } = await supabaseServer()
      .from('ruta_tiendas')
      .insert(body.tiendas.map(t => ({
        ruta_id:      ruta.id,
        store_cod:    t.store_cod,
        nombre:       t.nombre   ?? null,
        ventana:      t.ventana  ?? null,
        orden:        t.orden,
        pallets:      t.pallets,
        bultos:       t.bultos,
        contenedores: t.contenedores ?? 0,
      })));
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  }

  if (body.guias?.length) {
    const { error: gErr } = await supabaseServer()
      .from('ruta_guias')
      .insert(body.guias.map(g => ({
        ruta_id:   ruta.id,
        store_cod: g.store_cod ?? null,
        folio_dte: g.folio_dte,
        drive_url: g.drive_url ?? null,
      })));
    if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });
  }

  // ── Crear registros en trazabilidad_unidades (PUNTO 1 — Creación) ──
  // Enriquecer con datos de tiendas para caché de destino
  if (body.tiendas?.length) {
    const sb2 = supabaseServer();
    const cods = [...new Set(body.tiendas.map(t => t.store_cod))];
    const { data: tiendaRows } = await sb2
      .from('tiendas')
      .select('codigo, nombre, tipo, sector_comuna, region, direccion, ventana')
      .in('codigo', cods);

    const tiendaMap = Object.fromEntries(
      (tiendaRows ?? []).map((t: {
        codigo: string; nombre: string; tipo: string;
        sector_comuna: string; region: string; direccion: string; ventana: string;
      }) => [t.codigo, t])
    );

    // Guía por store_cod (primera coincidencia)
    const guiaMap: Record<string, string> = {};
    (body.guias ?? []).forEach(g => {
      if (g.store_cod && !guiaMap[g.store_cod]) guiaMap[g.store_cod] = g.folio_dte;
    });

    // Una fila por tipo de unidad por tienda (donde cantidad > 0)
    const trazRows: Record<string, unknown>[] = [];
    for (const t of body.tiendas) {
      const tienda = tiendaMap[t.store_cod] as {
        nombre?: string; tipo?: string; sector_comuna?: string;
        region?: string; direccion?: string; ventana?: string;
      } | undefined;

      const base = {
        origen:                    body.bodega_origen ?? 'Santiago',
        codigo_tienda:             t.store_cod,
        tienda_destino:            tienda?.nombre  ?? null,
        tipo_tienda:               tienda?.tipo    ?? null,
        comuna_destino:            tienda?.sector_comuna ?? null,
        region_destino:            tienda?.region  ?? null,
        direccion_tienda:          tienda?.direccion ?? null,
        ventana_horaria_recepcion: tienda?.ventana ?? null,
        transportista:             body.chofer,
        tipo_carga:                body.tipo_carga  ?? null,
        regimen:                   body.regimen     ?? null,
        numero_guia:               guiaMap[t.store_cod] ?? null,
        usuario_creador:           body.usuario_creador ?? null,
        ruta_id:                   ruta.id,
        estado_actual:             'CREADO',
        origen_carga:              'manual',
      };

      if (t.pallets > 0) {
        trazRows.push({ ...base, id_unidad_logistica: crypto.randomUUID(), tipo_unidad: 'Pallet' });
      }
      if (t.bultos > 0) {
        trazRows.push({ ...base, id_unidad_logistica: crypto.randomUUID(), tipo_unidad: 'Bulto' });
      }
      if ((t.contenedores ?? 0) > 0) {
        trazRows.push({ ...base, id_unidad_logistica: crypto.randomUUID(), tipo_unidad: 'Contenedor' });
      }
    }

    if (trazRows.length) {
      // fire-and-forget — no bloquea la respuesta al cliente
      void sb2.from('trazabilidad_unidades').insert(trazRows);

      // Mirror a Google Sheets (fire-and-forget)
      trazRows.forEach(row => {
        upsertTrazabilidadSheet(row as Parameters<typeof upsertTrazabilidadSheet>[0]).catch(() => {});
      });
    }
  }

  return NextResponse.json({ data: ruta });
}

/** Mapeo estado rutas_despacho → seguimiento despacho_rm */
const ESTADO_TO_SEGUIMIENTO: Record<string, string> = {
  pendiente:  'Pendiente',
  en_camino:  'En camino',
  entregado:  'Entregado',
  recibido:   'Recibido',
};

/** Convierte fecha ISO (YYYY-MM-DD) al formato DD/MM/YYYY de despacho_rm.fecha */
function isoToFecha(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export async function PATCH(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const body = await request.json() as { id: number; estado: string };
  const VALID = ['pendiente', 'en_camino', 'entregado', 'recibido'];
  if (!VALID.includes(body.estado))
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });

  const sb = supabaseServer();

  // 1. Actualizar estado de la ruta
  const { error } = await sb.from('rutas_despacho').update({ estado: body.estado }).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 2. Sincronizar seguimiento en despacho_rm / despacho_regiones (fire-and-forget)
  const seguimiento = ESTADO_TO_SEGUIMIENTO[body.estado];
  if (seguimiento) {
    // Obtener fecha y tiendas de esta ruta
    const { data: ruta } = await sb.from('rutas_despacho').select('fecha').eq('id', body.id).maybeSingle();
    const { data: rt   } = await sb.from('ruta_tiendas').select('store_cod').eq('ruta_id', body.id);
    const cods = (rt ?? []).map((r: { store_cod: string }) => r.store_cod).filter(Boolean);

    if (cods.length && ruta?.fecha) {
      const fechaFiltro = isoToFecha(ruta.fecha);
      await Promise.all([
        sb.from('despacho_rm')
          .update({ seguimiento })
          .in('cod', cods)
          .eq('fecha', fechaFiltro),
        sb.from('despacho_regiones')
          .update({ seguimiento })
          .in('cod', cods)
          .eq('fecha', fechaFiltro),
      ]);
    }
  }

  return NextResponse.json({ ok: true });
}
