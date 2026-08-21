import { describe, it, expect } from 'vitest';
import { construirClusters } from '../clustersHistoricos';

// helper: cluster (conjunto ordenado) al que pertenece una tienda
const clusterDe = (res: ReturnType<typeof construirClusters>, cod: string) =>
  res.clusters.find(c => c.cods.includes(cod))?.cods ?? [];

describe('construirClusters', () => {
  it('dos tiendas que viajan siempre juntas → mismo cluster', () => {
    const grupos = [['A', 'B'], ['A', 'B'], ['A', 'B']];
    const res = construirClusters(grupos);
    expect(res.clusterDeTienda['A']).toBe(res.clusterDeTienda['B']);
    expect(clusterDe(res, 'A')).toEqual(['A', 'B']);
  });

  it('grupo recurrente de 3 → un cluster con los 3', () => {
    const grupos = [['07CCR','22LGN','32BNV'], ['07CCR','22LGN','32BNV'], ['07CCR','22LGN','32BNV']];
    const res = construirClusters(grupos);
    expect(clusterDe(res, '07CCR')).toEqual(['07CCR','22LGN','32BNV']);
  });

  it('dos líneas separadas → dos clusters', () => {
    const grupos = [['A','B'], ['A','B'], ['C','D'], ['C','D']];
    const res = construirClusters(grupos);
    expect(res.clusters.length).toBe(2);
    expect(res.clusterDeTienda['A']).toBe(res.clusterDeTienda['B']);
    expect(res.clusterDeTienda['C']).toBe(res.clusterDeTienda['D']);
    expect(res.clusterDeTienda['A']).not.toBe(res.clusterDeTienda['C']);
  });

  it('un emparejamiento de UNA sola vez no une (minCount=2)', () => {
    const grupos = [['A','B'], ['A','B'], ['A','Z']]; // A-Z solo 1 vez
    const res = construirClusters(grupos);
    expect(res.clusterDeTienda['A']).toBe(res.clusterDeTienda['B']);
    expect(res.clusterDeTienda['Z']).not.toBe(res.clusterDeTienda['A']); // Z queda aparte
  });

  it('tienda con pocas salidas pero SIEMPRE con la misma → se une (ratio alto)', () => {
    // X aparece 12 veces (10 sola); A aparece 2, ambas con X → ratio 2/min(2,12)=1 → une A-X.
    const grupos = [
      ...Array(10).fill(['X']),
      ['A','X'], ['A','X'],
    ];
    const res = construirClusters(grupos);
    expect(res.clusterDeTienda['A']).toBe(res.clusterDeTienda['X']);
  });

  it('tienda aislada → su propio cluster (singleton)', () => {
    const grupos = [['A','B'], ['A','B'], ['SOLO']];
    const res = construirClusters(grupos);
    expect(clusterDe(res, 'SOLO')).toEqual(['SOLO']);
  });

  it('es determinista (ids/orden estables entre corridas)', () => {
    const grupos = [['B','A'], ['A','B'], ['D','C'], ['C','D']];
    const a = construirClusters(grupos);
    const b = construirClusters(grupos.slice().reverse());
    expect(a.clusters).toEqual(b.clusters);
  });

  it('umbral configurable (minRatio alto separa compañeros ocasionales)', () => {
    // A aparece 4 veces; 2 con B. ratio B = 2/min(appear) = 2/2(B)=1 pero A=4 → min es 2 → 1.
    // Subimos minCount para exigir más co-ocurrencias.
    const grupos = [['A','B'],['A','B'],['A','C'],['A','C'],['A','C']];
    const res = construirClusters(grupos, { minCount: 3 });
    expect(res.clusterDeTienda['A']).toBe(res.clusterDeTienda['C']); // A-C 3 veces → une
    expect(res.clusterDeTienda['B']).not.toBe(res.clusterDeTienda['A']); // A-B solo 2 → no
  });
});
