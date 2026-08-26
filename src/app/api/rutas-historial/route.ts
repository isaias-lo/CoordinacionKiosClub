import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';
import { construirHistorialTiendas, type FilaPicking, type FilaDespacho } from '@/features/despacho/rutas/utils/historialTiendas';
import type { EsperadoTienda } from '@/features/despacho/rutas/utils/enrutadorIncremental';

// [PASO 3] GET /api/rutas-historial?fecha=YYYY-MM-DD
// Devuelve, por tienda, el `EsperadoTienda` para un día como `fecha` (default hoy):
//  - volumen (esperado = mediana de unidades/día del MISMO día de semana; techoPallets = promedio+1σ
//    de pallets+contenedores) desde `picking_pallets` (is_active) — solo días pasados.
//  - empresa/confianzaEmpresa desde `despacho_rm` + `despacho_regiones` (columna `transporte`),
//    ponderando lo reciente (empresaHabitual).
// Solo lectura, no DDL. Cacheado en memoria ~1 h por fecha, como /api/rutas-clusters.

interface HistorialResponse {
  data: Record<string, EsperadoTienda>;
  meta: { tiendas: number; fecha: string; generadoEn: string };
}

const cache = new Map<string, { at: number; data: HistorialResponse }>();
const TTL_MS = 60 * 60 * 1000; // 1 h

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function pullPicking(): Promise<FilaPicking[]> {
  const sb = supabaseServer();
  const rows: FilaPicking[] = [];
  for (let from = 0; from < 300_000; from += 1000) {
    const { data, error } = await sb.from('picking_pallets')
      .select('store_cod, tipo, date')
      .eq('is_active', true)
      .range(from, from + 999);
    if (error || !data?.length) break;
    rows.push(...(data as FilaPicking[]));
    if (data.length < 1000) break;
  }
  return rows;
}

async function pullDespachos(table: string): Promise<FilaDespacho[]> {
  const sb = supabaseServer();
  const rows: FilaDespacho[] = [];
  for (let from = 0; from < 300_000; from += 1000) {
    const { data, error } = await sb.from(table)
      .select('cod, fecha, transporte')
      .range(from, from + 999);
    if (error || !data?.length) break;
    rows.push(...(data as FilaDespacho[]));
    if (data.length < 1000) break;
  }
  return rows;
}

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const fecha = request.nextUrl.searchParams.get('fecha') || hoyISO();
  const force = request.nextUrl.searchParams.get('refresh') === '1';
  const hit = cache.get(fecha);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ ...hit.data, cached: true });

  try {
    const [picking, despRm, despReg] = await Promise.all([
      pullPicking(),
      pullDespachos('despacho_rm'),
      pullDespachos('despacho_regiones'),
    ]);
    const historial = construirHistorialTiendas(picking, [...despRm, ...despReg], fecha);
    const data: HistorialResponse = {
      data: historial,
      meta: { tiendas: Object.keys(historial).length, fecha, generadoEn: new Date().toISOString() },
    };
    cache.set(fecha, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
