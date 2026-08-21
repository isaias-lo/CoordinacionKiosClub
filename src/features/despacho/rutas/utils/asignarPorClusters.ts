// [E4] Asignación automática tienda→camión por CLUSTERS históricos + capacidad.
//
// Toma el pool del día (stores) y los clusters aprendidos del historial, y produce un mapa
// patente→tiendas. Reglas:
//   1) cada tienda se resuelve a su cluster (historial directo; si es nueva/sin historial, al
//      cluster más cercano por lat/lon; si no hay coords, por corredor);
//   2) los clusters se empacan en los camiones ACTIVOS respetando capacidad (pallets/bultos),
//      prefiriendo un camión propio por cluster (así se replican las "líneas"); si hay más
//      clusters que camiones, se comparten; si un cluster excede un camión, se parte por nn.
// El ORDEN de parada NO se calcula aquí — sale de `nn()` vía `rutasDesdeAsignaciones` (reuso).
//
// Puro y testeable: sin red ni estado.

import { dkm } from './helpers';
import type { StoreItem } from './routing';
import type { Vehiculo } from '../data/flota';
import type { TiendaInfo } from '../data/tiendas';

export interface CentroideCluster { lat: number; lon: number; }

/** Resuelve el cluster de una tienda: historial → geo (centroide más cercano) → corredor. */
export function resolverCluster(
  cod: string,
  clusterDeTienda: Record<string, number>,
  centroides: Record<number, CentroideCluster>,
  gps: Record<string, number[]>,
  tiendasData: Record<string, TiendaInfo>,
): number | null {
  if (clusterDeTienda[cod] != null) return clusterDeTienda[cod];      // 1) historial directo
  const g = gps[cod];
  if (g && g.length >= 2) {                                            // 2) lat/lon → centroide más cercano
    let best: number | null = null, bd = Infinity;
    for (const [idStr, ctr] of Object.entries(centroides)) {
      const d = dkm([g[0], g[1]], [ctr.lat, ctr.lon]);
      if (d < bd) { bd = d; best = Number(idStr); }
    }
    if (best != null) return best;
  }
  const cor = tiendasData[cod]?.corredor;                             // 3) mismo corredor que otra tienda
  if (cor) {
    for (const otherCod of Object.keys(clusterDeTienda)) {
      if (tiendasData[otherCod]?.corredor === cor) return clusterDeTienda[otherCod];
    }
  }
  return null;                                                        // sin cluster → grupo propio
}

interface Bin { v: Vehiculo; ts: StoreItem[]; p: number; b: number; }
const carga = (arr: StoreItem[]) => arr.reduce((s, t) => s + t.p, 0);
const bultos = (t: StoreItem) => t.b + (t.ch ?? 0);

export function asignarPorClusters(
  stores: StoreItem[],
  flota: Vehiculo[],
  clusterDeTienda: Record<string, number>,
  centroides: Record<number, CentroideCluster>,
  gps: Record<string, number[]>,
  tiendasData: Record<string, TiendaInfo>,
): Record<string, StoreItem[]> {
  const disp = flota.filter(v => v.on && !v.tlbd);
  if (!disp.length || !stores.length) return {};

  // 1) agrupar el pool por cluster resuelto (las sin cluster van en su propio grupo).
  const grupos = new Map<string, StoreItem[]>();
  for (const s of stores) {
    const cid = resolverCluster(s.c, clusterDeTienda, centroides, gps, tiendasData);
    const key = cid != null ? `c${cid}` : `solo:${s.c}`;
    (grupos.get(key) ?? grupos.set(key, []).get(key)!).push(s);
  }

  const bins: Bin[] = disp.map(v => ({ v, ts: [], p: 0, b: 0 }));
  const cabe = (bin: Bin, p: number, b: number) => bin.p + p <= bin.v.c && bin.b + b <= bin.v.b;

  // 2) clusters grandes primero. Cada cluster intenta ir a UN camión (prefiere el más vacío que
  //    lo contenga → una línea por camión); si no entra entero, se parte; si nada entra, overflow.
  const gruposArr = [...grupos.values()].sort((a, b) => carga(b) - carga(a));
  for (const grupo of gruposArr) {
    const gp = carga(grupo), gb = grupo.reduce((s, t) => s + bultos(t), 0);
    const candidatos = bins.filter(bin => cabe(bin, gp, gb)).sort((a, b) => a.p - b.p);
    if (candidatos.length) {
      const bin = candidatos[0];
      for (const t of grupo) { bin.ts.push(t); bin.p += t.p; bin.b += bultos(t); }
      continue;
    }
    // no entra entero → repartir tienda por tienda al camión con más capacidad libre que quepa.
    for (const t of grupo) {
      const tb = bultos(t);
      const fit = bins.filter(bin => cabe(bin, t.p, tb)).sort((a, b) => (b.v.c - b.p) - (a.v.c - a.p));
      if (fit.length) { fit[0].ts.push(t); fit[0].p += t.p; fit[0].b += tb; }
      else {
        const ov = bins.slice().sort((a, b) => a.p - b.p)[0]; // overflow al menos cargado
        ov.ts.push(t); ov.p += t.p; ov.b += tb;
      }
    }
  }

  const out: Record<string, StoreItem[]> = {};
  for (const bin of bins) if (bin.ts.length) out[bin.v.p] = bin.ts;
  return out;
}
