import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';
import { fechaChile, fechaChileDe } from '@/lib/fechaChile';
import {
  pendientesDelDia, ruteadasParaOrigen, type PendienteBacklog,
} from '@/features/despacho/rutas/utils/backlogSegundaVuelta';

/**
 * GET /api/backlog-v2 — pendientes de 2ª vuelta deducidos de los datos.
 *
 * Vive en el SERVIDOR por una razón concreta, no por estilo: `rutas_despacho` tiene RLS activo y
 * NINGUNA política. Desde el navegador devuelve cero filas **sin error**, así que el cálculo creía
 * que no existía ningún manifiesto y marcaba como pendiente TODO lo que tuviera carga — 164 filas
 * donde había 15 reales. El resto de la app nunca lo notó porque lee los manifiestos por
 * /api/rutas-despacho, que corre con service role. Esta consulta hacía lo contrario.
 *
 * Además `ruta_tiendas` no tiene foreign key a `rutas_despacho`, así que el `select` anidado de
 * PostgREST tampoco es confiable: acá se hace el cruce a mano, por `ruta_id`.
 *
 *     lo que Bodega REGISTRÓ ese día      (despacho_sesion)
 *   − lo que entró en algún MANIFIESTO    (ese día o DESPUÉS)
 */
export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const dias = Math.min(60, Math.max(1, Number(request.nextUrl.searchParams.get('dias')) || 10));
    const hoy = fechaChile();
    const desde = fechaChileDe(new Date(new Date(`${hoy}T00:00:00Z`).getTime() - dias * 86400000));
    // Los manifiestos se miran hasta una semana ADELANTE: una 2ª vuelta se despacha después del día
    // de origen. El tope acota las fechas basura (hay un manifiesto con fecha 2099-12-31): sin él,
    // un dedazo marcaría esa tienda como despachada para siempre.
    const hasta = fechaChileDe(new Date(new Date(`${hoy}T00:00:00Z`).getTime() + 7 * 86400000));

    const sb = supabaseServer();
    const [sesion, rutas] = await Promise.all([
      sb.from('despacho_sesion')
        .select('fecha, tienda_cod, fuente, pallets, bultos, contenedores, chocolates')
        .gte('fecha', desde).lt('fecha', hoy),
      sb.from('rutas_despacho').select('id, fecha').gte('fecha', desde).lte('fecha', hasta),
    ]);
    if (sesion.error) return NextResponse.json({ error: sesion.error.message }, { status: 500 });
    if (rutas.error)  return NextResponse.json({ error: rutas.error.message },  { status: 500 });

    const rutasArr = (rutas.data ?? []) as { id: number; fecha: string }[];
    const fechaDeRuta = new Map(rutasArr.map(r => [r.id, r.fecha]));

    // Cruce a mano por ruta_id (no hay FK, así que no se puede anidar).
    const { data: tiendasRuta, error: errT } = rutasArr.length
      ? await sb.from('ruta_tiendas').select('ruta_id, store_cod').in('ruta_id', rutasArr.map(r => r.id))
      : { data: [], error: null };
    if (errT) return NextResponse.json({ error: errT.message }, { status: 500 });

    const porFecha = new Map<string, string[]>();
    for (const t of (tiendasRuta ?? []) as { ruta_id: number; store_cod: string }[]) {
      const f = fechaDeRuta.get(t.ruta_id);
      if (!f) continue;
      porFecha.set(f, [...(porFecha.get(f) ?? []), t.store_cod]);
    }
    const manifiestos = [...porFecha.entries()].map(([fecha, cods]) => ({ fecha, cods }));

    // Congelados NO entra: tiene su propio flujo y su propia pestaña.
    const cargaPorFecha = new Map<string, { cod: string; pallets: number; bultos: number; contenedores: number; chocolates: number }[]>();
    for (const f of (sesion.data ?? []) as { fecha: string; tienda_cod: string; fuente: string | null; pallets: number; bultos: number; contenedores: number | null; chocolates: number | null }[]) {
      if ((f.fuente ?? '').startsWith('congelados')) continue;
      cargaPorFecha.set(f.fecha, [...(cargaPorFecha.get(f.fecha) ?? []), {
        cod: f.tienda_cod, pallets: f.pallets, bultos: f.bultos,
        contenedores: f.contenedores ?? 0, chocolates: f.chocolates ?? 0,
      }]);
    }

    const pendientes: PendienteBacklog[] = [];
    for (const [fecha, filas] of cargaPorFecha) {
      pendientes.push(...pendientesDelDia(filas, ruteadasParaOrigen(manifiestos, fecha), fecha));
    }

    return NextResponse.json({ pendientes, desde, hoy, manifiestos: manifiestos.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
