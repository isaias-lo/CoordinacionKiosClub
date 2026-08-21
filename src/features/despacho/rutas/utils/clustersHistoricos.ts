// [E4] Clusters históricos de tiendas que "viajan juntas" (líneas/corredores del coordinador).
//
// La data probó que el patrón estable NO es tienda→camión (los camiones rotan) sino qué tiendas
// comparten camión el mismo día (co-ocurrencia): 77% de las tiendas tienen un compañero fijo ≥60%
// del tiempo. Este módulo toma los grupos camión-día históricos y deriva clusters deterministas
// mediante un grafo de co-ocurrencia + Union-Find sobre las aristas "fuertes".
//
// Puro y testeable: no toca red ni estado. El endpoint /api/rutas-clusters lo alimenta con los
// grupos reales de despacho_rm/despacho_regiones.

export interface ClustersHistoricos {
  /** cod de tienda → id de cluster. */
  clusterDeTienda: Record<string, number>;
  /** clusters ordenados de forma determinista; cada uno con sus códigos. */
  clusters: { id: number; cods: string[] }[];
}

export interface ConstruirClustersOpts {
  /** Co-ocurrencias mínimas para considerar una arista (ignora emparejamientos de una sola vez). */
  minCount?: number;   // default 2
  /** Ratio mínimo co(a,b)/min(apariciones) para unir dos tiendas en un cluster. */
  minRatio?: number;   // default 0.5
}

/**
 * Construye clusters de tiendas a partir de los grupos camión-día históricos.
 * `gruposCamionDia`: cada elemento es el conjunto de códigos de tienda que compartieron un
 * camión en un día (p. ej. `['07CCR','22LGN','32BNV']`).
 */
export function construirClusters(
  gruposCamionDia: string[][],
  opts: ConstruirClustersOpts = {},
): ClustersHistoricos {
  const minCount = opts.minCount ?? 2;
  const minRatio = opts.minRatio ?? 0.5;

  const appear: Record<string, number> = {};             // apariciones de cada tienda
  const co: Record<string, Record<string, number>> = {}; // co-ocurrencias por par

  for (const grupoRaw of gruposCamionDia) {
    const grupo = [...new Set(grupoRaw)].filter(Boolean);
    for (const a of grupo) {
      appear[a] = (appear[a] ?? 0) + 1;
      (co[a] ??= {});
      for (const b of grupo) if (a !== b) co[a][b] = (co[a][b] ?? 0) + 1;
    }
  }

  // Union-Find (determinista: la raíz de menor código gana).
  const parent: Record<string, string> = {};
  const find = (x: string): string => {
    parent[x] ??= x;
    return parent[x] === x ? x : (parent[x] = find(parent[x]));
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    const [lo, hi] = ra < rb ? [ra, rb] : [rb, ra];
    parent[hi] = lo;
  };
  for (const cod of Object.keys(appear)) find(cod); // cada tienda es al menos un nodo

  const seen = new Set<string>();
  for (const a of Object.keys(co)) {
    for (const b of Object.keys(co[a])) {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const w = co[a][b];
      const ratio = w / Math.min(appear[a], appear[b]);
      if (w >= minCount && ratio >= minRatio) union(a, b);
    }
  }

  const byRoot: Record<string, string[]> = {};
  for (const cod of Object.keys(appear)) {
    const r = find(cod);
    (byRoot[r] ??= []).push(cod);
  }

  // Orden determinista: clusters por su código mínimo; cods internos ordenados.
  const roots = Object.keys(byRoot).sort();
  const clusters = roots.map((r, i) => ({ id: i, cods: byRoot[r].slice().sort() }));
  const clusterDeTienda: Record<string, number> = {};
  for (const c of clusters) for (const cod of c.cods) clusterDeTienda[cod] = c.id;

  return { clusterDeTienda, clusters };
}
