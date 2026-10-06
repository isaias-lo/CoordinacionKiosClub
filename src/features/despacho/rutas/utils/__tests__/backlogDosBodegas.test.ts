import { describe, it, expect } from 'vitest';
import { recordarFila, combinadasPorTienda, type MemoriaSesion } from '../conteosPorFuente';
import { pendientesDelDia } from '../backlogSegundaVuelta';
import type { SesionRow } from '@/lib/despachoSesion';

// ── LA TIENDA QUE SALÍA DOS VECES EN LA 2ª VUELTA ──────────────────────────────────────────────
//
// Una tienda puede tener DOS filas en `despacho_sesion`, una por espejo de Bodega: pasa cuando se
// pesa en RM/Costa un pallet de una tienda de Regiones. Son las MISMAS unidades vistas desde dos
// lados —los mismos slots de picking—, así que sumarlas cuenta doble.
//
// `/api/backlog-v2` metía una entrada por FILA, así que el backlog listaba la tienda dos veces con
// su conteo parcial cada vez. Medido el 06/10/2026 en `despacho_sesion`:
//
//     06/10  60PBL  regiones:2P/0B · santiago:1P/0B
//     05/10  47PTV  regiones:2P/0B · santiago:2P/0B   →  salía dos veces, 2P cada una
//     05/10  42ANP  regiones:3P/0B · santiago:1P/0B
//
// El Enrutador ya combinaba desde el #613. Esta ruta del SERVIDOR se había quedado afuera.

const fila = (fuente: string, cod: string, pallets: number, bultos = 0, chocolates = 0): SesionRow =>
  ({ fecha: '2026-10-05', fuente, tienda_cod: cod, pallets, bultos, contenedores: 0, chocolates });

/** Lo que hace la ruta: anotar las filas crudas y quedarse con una por tienda. */
function comoLaRuta(filas: SesionRow[]) {
  const mem: MemoriaSesion = new Map();
  for (const f of filas) recordarFila(mem, f.tienda_cod, f);
  return [...combinadasPorTienda(mem)].map(([cod, r]) => ({
    cod, pallets: r.pallets, bultos: r.bultos, contenedores: r.contenedores, chocolates: r.chocolates,
  }));
}

describe('el backlog de 2ª vuelta cuenta cada tienda UNA vez', () => {
  it('EL CASO 47PTV: dos filas de 2P dan UN pendiente de 2P, no dos', () => {
    const carga = comoLaRuta([fila('regiones', '47PTV', 2), fila('santiago', '47PTV', 2)]);
    const p = pendientesDelDia(carga, new Set(), '2026-10-05');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ c: '47PTV', p: 2 });
  });

  it('EL CASO 42ANP: una bodega ve 3 y la otra 1 — manda el máximo, no la suma', () => {
    // Sumar daría 4 pallets para una tienda que tiene 3. Quedarse con la última daría 1.
    const carga = comoLaRuta([fila('regiones', '42ANP', 3), fila('santiago', '42ANP', 1)]);
    const p = pendientesDelDia(carga, new Set(), '2026-10-05');
    expect(p).toHaveLength(1);
    expect(p[0].p).toBe(3);
  });

  it('EL CASO 60PBL del 06/10', () => {
    const carga = comoLaRuta([fila('regiones', '60PBL', 2), fila('santiago', '60PBL', 1)]);
    expect(pendientesDelDia(carga, new Set(), '2026-10-06')).toEqual([
      { c: '60PBL', p: 2, b: 0, ch: 0, fechaOrigen: '2026-10-06' },
    ]);
  });

  it('el máximo es POR ENVASE: cada bodega puede ver mejor una cosa distinta', () => {
    // 53VAL el 05/10: regiones 2P/2B, santiago 1P/0B. La buena es 2P y 2B.
    const carga = comoLaRuta([fila('regiones', '53VAL', 2, 2), fila('santiago', '53VAL', 1, 0)]);
    const p = pendientesDelDia(carga, new Set(), '2026-10-05');
    expect(p[0]).toMatchObject({ c: '53VAL', p: 2, b: 2 });
  });

  it('una tienda con UNA sola fila no cambia en nada', () => {
    // La propiedad que importa: esto no mueve ningún número que hoy esté bien.
    const carga = comoLaRuta([fila('santiago', '12LAS', 3, 4, 2)]);
    expect(pendientesDelDia(carga, new Set(), '2026-10-05')).toEqual([
      { c: '12LAS', p: 3, b: 4, ch: 2, fechaOrigen: '2026-10-05' },
    ]);
  });

  it('varias tiendas mezcladas: cada una una vez, ordenadas', () => {
    const carga = comoLaRuta([
      fila('regiones', '47PTV', 2), fila('santiago', '47PTV', 2),
      fila('santiago', '12LAS', 1),
      fila('regiones', '42ANP', 3), fila('santiago', '42ANP', 1),
    ]);
    const p = pendientesDelDia(carga, new Set(), '2026-10-05');
    expect(p.map(x => x.c)).toEqual(['12LAS', '42ANP', '47PTV']);
    expect(p.map(x => x.p)).toEqual([1, 3, 2]);
  });

  it('una tienda ya ruteada sigue quedando afuera, combinada o no', () => {
    const carga = comoLaRuta([fila('regiones', '47PTV', 2), fila('santiago', '47PTV', 2)]);
    expect(pendientesDelDia(carga, new Set(['47PTV']), '2026-10-05')).toEqual([]);
  });
});
