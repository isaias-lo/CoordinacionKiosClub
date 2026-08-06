import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { agruparResumenDiario, resumenParaGrafico } from '@/lib/despachoResumen';

export const dynamic = 'force-dynamic';

/**
 * Trae (fecha, tipo) de una tabla de despacho paginando de a 1000 (Supabase corta cada request en
 * ~1000 filas). Ordenado por created_at desc y acotado por `since`, así juntamos los ~N registros
 * MÁS RECIENTES completos sin que el cap deje conteos parciales. `maxRows` limita el total.
 */
async function fetchRecent(sb: SupabaseClient, table: string, since: string, maxRows = 4000) {
  const rows: { fecha: string; tipo: string }[] = [];
  for (let from = 0; from < maxRows; from += 1000) {
    const { data, error } = await sb.from(table)
      .select('fecha, tipo')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as { fecha: string; tipo: string }[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/**
 * Resumen diario del despacho REAL (despacho_rm + despacho_regiones), contando una unidad por fila
 * (pallet/bulto/chocolate/contenedor). Alimenta el gráfico del home con la verdad del registro, en
 * vez de los totales de historial_despacho (que subcuentan y se fragmentan).
 *
 * GET /api/despacho-resumen?dias=7  → { dias: [{ fecha, fechaISO, pallets, bultos, contenedores, chocolates }] }
 */
export async function GET(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const n = Math.min(60, Math.max(1, Number(new URL(request.url).searchParams.get('dias') ?? 7)));
    const sb = supabaseServer();
    // Acotar por created_at (los despachos recientes) para no traer todo el histórico.
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const [rmRows, regRows] = await Promise.all([
      fetchRecent(sb, 'despacho_rm', since),
      fetchRecent(sb, 'despacho_regiones', since),
    ]);

    // Se toman los N días más recientes CON despacho; al venir ordenado desc, esos días están
    // completos (hay registros más viejos por debajo del corte de paginación).
    const dias = resumenParaGrafico(agruparResumenDiario([...rmRows, ...regRows]), n);
    return NextResponse.json({ dias });
  } catch (err) {
    console.error('[GET /api/despacho-resumen]', err);
    return NextResponse.json({ error: 'Error al obtener el resumen' }, { status: 500 });
  }
}
