import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';
import { construirClusters, type ClustersHistoricos } from '@/features/despacho/rutas/utils/clustersHistoricos';

// [E4] GET /api/rutas-clusters
// Lee el historial de despacho (despacho_rm + despacho_regiones), arma los grupos "camión-día"
// (qué tiendas compartieron camión el mismo día) y deriva los CLUSTERS históricos (líneas del
// coordinador) + el centroide lat/lon de cada cluster. SOLO LECTURA: no escribe nada, no DDL.
// La asignación automática del Enrutador usa esto como "cerebro". Cacheado en memoria ~1 h.

interface ClustersResponse extends ClustersHistoricos {
  centroides: Record<number, { lat: number; lon: number }>;
  meta: { dias: number; grupos: number; tiendas: number; generadoEn: string };
}

let cache: { at: number; data: ClustersResponse } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1 h

async function pullTodo(table: string): Promise<{ cod: string; fecha: string; patente: string; vuelta: number | null }[]> {
  const sb = supabaseServer();
  const rows: { cod: string; fecha: string; patente: string; vuelta: number | null }[] = [];
  for (let from = 0; from < 60000; from += 1000) {
    const { data, error } = await sb.from(table)
      .select('cod, fecha, patente, vuelta')
      .range(from, from + 999);
    if (error || !data?.length) break;
    rows.push(...(data as typeof rows));
    if (data.length < 1000) break;
  }
  return rows;
}

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const force = request.nextUrl.searchParams.get('refresh') === '1';
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ ...cache.data, cached: true });
  }

  try {
    const all = [...await pullTodo('despacho_rm'), ...await pullTodo('despacho_regiones')]
      .filter(r => r.cod && r.patente && r.fecha);

    // Grupos camión-día: (fecha|patente|vuelta) → set de tiendas.
    const byGroup = new Map<string, Set<string>>();
    const dias = new Set<string>();
    for (const r of all) {
      dias.add(r.fecha);
      const k = `${r.fecha}|${r.patente}|${r.vuelta ?? 1}`;
      (byGroup.get(k) ?? byGroup.set(k, new Set()).get(k)!).add(r.cod);
    }
    const gruposCamionDia = [...byGroup.values()].map(s => [...s]);

    const { clusterDeTienda, clusters } = construirClusters(gruposCamionDia);

    // Centroides lat/lon por cluster (promedio de coords de sus tiendas con coordenadas).
    const sb = supabaseServer();
    const { data: tiendas } = await sb.from('tiendas').select('codigo, lat, lon');
    const coord: Record<string, { lat: number; lon: number }> = {};
    for (const t of (tiendas ?? []) as { codigo: string; lat: number | null; lon: number | null }[]) {
      if (t.lat != null && t.lon != null) coord[t.codigo] = { lat: t.lat, lon: t.lon };
    }
    const centroides: Record<number, { lat: number; lon: number }> = {};
    for (const c of clusters) {
      const pts = c.cods.map(cod => coord[cod]).filter(Boolean) as { lat: number; lon: number }[];
      if (pts.length) {
        centroides[c.id] = {
          lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
          lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length,
        };
      }
    }

    const data: ClustersResponse = {
      clusterDeTienda, clusters, centroides,
      meta: { dias: dias.size, grupos: gruposCamionDia.length, tiendas: Object.keys(clusterDeTienda).length, generadoEn: new Date().toISOString() },
    };
    cache = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
