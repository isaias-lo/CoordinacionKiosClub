import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { agruparResumenDiario, resumenParaGrafico } from '@/lib/despachoResumen';
import { filasDeDespacho } from '@/lib/despachoFilas';

export const dynamic = 'force-dynamic';

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
    // Acotar por created_at (los despachos recientes) para no traer todo el histórico. La lectura
    // es la MISMA que usan las tarjetas de Inicio (lib/despachoFilas.ts): si cada pantalla lee a su
    // manera, terminan mostrando números distintos del mismo día — que es lo que pasaba (C-01).
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const filas = await filasDeDespacho(supabaseServer(), since);

    // Se toman los N días más recientes CON despacho; al venir ordenado desc, esos días están
    // completos (hay registros más viejos por debajo del corte de paginación).
    const dias = resumenParaGrafico(agruparResumenDiario(filas), n);
    return NextResponse.json({ dias });
  } catch (err) {
    console.error('[GET /api/despacho-resumen]', err);
    return NextResponse.json({ error: 'Error al obtener el resumen' }, { status: 500 });
  }
}
