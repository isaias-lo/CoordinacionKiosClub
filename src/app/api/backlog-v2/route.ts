import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, hayServiceRole } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';
import { fechaChile, fechaChileDe } from '@/lib/fechaChile';
import {
  pendientesDelDia, despachadasParaOrigen, aFechaPlanilla, desdeFechaPlanilla,
  type PendienteBacklog,
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
 * El cruce con `ruta_tiendas` se hace a mano, por `ruta_id`, en dos consultas.
 *
 * (Acá decía que era porque `ruta_tiendas` no tenía foreign key. Es falso: la restricción
 * `ruta_tiendas_ruta_id_fkey` existe, con `on delete no action` — comprobado en `pg_constraint`.
 * El cruce manual igual se deja, porque así se controla el rango de fechas de los manifiestos en
 * la misma consulta; pero el motivo escrito no era el real.)
 *
 *     lo que Bodega REGISTRÓ ese día      (despacho_sesion)
 *   − lo que entró en algún MANIFIESTO    (ese día o DESPUÉS)
 */
interface FilaDespachada { fecha: string; cod: string; patente: string | null }

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const dias = Math.min(60, Math.max(1, Number(request.nextUrl.searchParams.get('dias')) || 10));
    const hoy = fechaChile();
    const desde = fechaChileDe(new Date(new Date(`${hoy}T00:00:00Z`).getTime() - dias * 86400000));
    // Los manifiestos se miran hasta una semana ADELANTE: una 2ª vuelta se despacha después del día
    // de origen.
    //
    // Se miran los despachos hasta una semana ADELANTE: una 2ª vuelta sale en un día posterior al
    // de origen.
    const hasta = fechaChileDe(new Date(new Date(`${hoy}T00:00:00Z`).getTime() + 7 * 86400000));
    // Control Despacho guarda la fecha en el formato de la planilla ("DD/MM/YYYY"), no en ISO.
    const fechasPlanilla: string[] = [];
    for (let t = new Date(`${desde}T00:00:00Z`); fechaChileDe(t) <= hasta; t = new Date(t.getTime() + 86400000)) {
      fechasPlanilla.push(aFechaPlanilla(fechaChileDe(t)));
    }

    const sb = supabaseServer();
    // Una tienda SALIÓ si quedó con patente en Control Despacho. Ese es el registro que deja cerrar
    // un camión, y es el mismo dato que mira el coordinador. Las dos tablas: el Enrutador escribe
    // las de RM en `despacho_rm` y las de región en `despacho_regiones` — mirar solo una dejaba a
    // toda la ruta norte figurando como pendiente para siempre.
    // PostgREST devuelve como mucho ~1000 filas y NO avisa cuando corta. Control Despacho tiene
    // más de mil filas con patente en dos semanas (1249 el 17/09), así que sin paginar se traía
    // solo los días más viejos: los recientes quedaban sin despachos y TODA su carga aparecía
    // como pendiente. Es exactamente lo que hizo aparecer 29 tiendas del 16 donde había 6.
    const PAGINA = 1000;
    const conPatente = async (tabla: 'despacho_rm' | 'despacho_regiones') => {
      const filas: FilaDespachada[] = [];
      for (let desdeFila = 0; ; desdeFila += PAGINA) {
        const { data, error } = await sb.from(tabla)
          .select('fecha, cod, patente')
          .in('fecha', fechasPlanilla)
          .not('patente', 'is', null)
          .order('id', { ascending: true })            // orden estable: sin él una página puede repetir o saltar
          .range(desdeFila, desdeFila + PAGINA - 1);
        if (error) throw new Error(`${tabla}: ${error.message}`);
        const pagina = (data ?? []) as FilaDespachada[];
        filas.push(...pagina);
        if (pagina.length < PAGINA) return filas;      // última página
      }
    };

    const [sesion, rm, reg] = await Promise.all([
      sb.from('despacho_sesion')
        .select('fecha, tienda_cod, fuente, pallets, bultos, contenedores, chocolates')
        .gte('fecha', desde).lt('fecha', hoy),
      conPatente('despacho_rm'),
      conPatente('despacho_regiones'),
    ]);
    if (sesion.error) return NextResponse.json({ error: sesion.error.message }, { status: 500 });

    const porFecha = new Map<string, string[]>();
    for (const f of [...rm, ...reg]) {
      if (!String(f.patente ?? '').trim()) continue;   // fila sin patente: esa tienda no salió
      const iso = desdeFechaPlanilla(f.fecha);
      if (!iso) continue;
      porFecha.set(iso, [...(porFecha.get(iso) ?? []), f.cod]);
    }
    const despachos = [...porFecha.entries()].map(([fecha, cods]) => ({ fecha, cods }));

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
      pendientes.push(...pendientesDelDia(filas, despachadasParaOrigen(despachos, fecha), fecha));
    }

    // Los contadores viajan a propósito: si el cálculo devuelve de más, lo primero que hay que saber
    // es CUÁNTO alcanzó a leer. Sin esto, diagnosticarlo desde afuera es adivinar.
    return NextResponse.json({
      pendientes, desde, hoy,
      diasConDespacho: despachos.length,
      filasLeidas: { despacho_rm: rm.length, despacho_regiones: reg.length },
      serviceRole: hayServiceRole(),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
