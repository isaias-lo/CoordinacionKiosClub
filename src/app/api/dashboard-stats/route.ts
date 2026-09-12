import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { filasDeDespacho } from '@/lib/despachoFilas';
import { agruparResumenDiario, resumenParaTarjetas } from '@/lib/despachoResumen';
import { fechaChile } from '@/lib/fechaChile';

/**
 * GET /api/dashboard-stats?days=90
 *
 * Las tarjetas de Inicio: el despacho REAL (despacho_rm + despacho_regiones) agregado por día.
 *
 * Devuelve: { data: [{ date: 'YYYY-MM-DD', total_pallets, total_bultos,
 *             total_contenedores, total_chocolates }] } ordenado por fecha desc.
 *
 * [C-01] Antes esta ruta leía y contaba por su cuenta, y por eso mostraba otra cosa que el gráfico
 * de la misma pantalla: pedía 50.000 filas ordenadas por `id` y recibía 1.000 ordenadas
 * alfabéticamente — o sea, casi puros pallets (ver lib/despachoFilas.ts). Ahora la lectura y la
 * cuenta son las mismas que las del gráfico; lo único propio es la ventana de días y la forma de la
 * respuesta.
 */
export async function GET(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const days = Math.max(1, Math.min(365, Number(new URL(request.url).searchParams.get('days') ?? 90)));
  const desdeISO = fechaChile(-days);
  // `created_at` va 2 días más atrás que la ventana de `fecha`: una carga se registra la tarde
  // anterior al despacho, así que su fila nace antes de la fecha que declara.
  const desdeCreacion = new Date(`${fechaChile(-days - 2)}T00:00:00Z`).toISOString();

  try {
    const filas = await filasDeDespacho(supabaseServer(), desdeCreacion);
    return NextResponse.json({ data: resumenParaTarjetas(agruparResumenDiario(filas), desdeISO) });
  } catch (err) {
    console.error('[GET /api/dashboard-stats]', err);
    return NextResponse.json({ error: 'Error al obtener las estadísticas' }, { status: 500 });
  }
}
