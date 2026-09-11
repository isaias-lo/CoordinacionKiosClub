import { describe, it, expect } from 'vitest';
import { idsDeSeleccion, etiquetasDeLaSeleccion } from '../seleccionImpresion';

// La tarjeta de un encargado con P1, B1, B2, B3: cada TIPO numera por separado, así que P1 y B1
// tienen el mismo número (1). Ese es el origen del bug.
const slots = [
  { id: 100, tipo: 'P' }, // P1
  { id: 101, tipo: 'B' }, // B1
  { id: 102, tipo: 'B' }, // B2
  { id: 103, tipo: 'B' }, // B3
];
const etiquetas = [
  { stateKey: 'X__ana', slotId: 100, palletNum: 1, tipo: 'P' },
  { stateKey: 'X__ana', slotId: 101, palletNum: 1, tipo: 'B' },
  { stateKey: 'X__ana', slotId: 102, palletNum: 2, tipo: 'B' },
  { stateKey: 'X__ana', slotId: 103, palletNum: 3, tipo: 'B' },
  { stateKey: 'X__otro', slotId: 200, palletNum: 4, tipo: 'P' },
];

describe('idsDeSeleccion', () => {
  it('traduce lo que se tocó en la tarjeta al id de cada pallet', () => {
    expect([...idsDeSeleccion(slots, [3])]).toEqual([103]);
    expect([...idsDeSeleccion(slots, [0, 2])].sort()).toEqual([100, 102]);
  });

  it('ignora índices que ya no existen (la tarjeta cambió mientras se elegía)', () => {
    expect([...idsDeSeleccion(slots, [9])]).toEqual([]);
  });

  it('ignora pallets todavía no guardados (id temporal): no tienen etiqueta real', () => {
    expect([...idsDeSeleccion([{ id: -5 }], [0])]).toEqual([]);
  });
});

describe('etiquetasDeLaSeleccion', () => {
  it('seleccionar B3 imprime SOLO B3', () => {
    const out = etiquetasDeLaSeleccion(etiquetas, { stateKey: 'X__ana', slotIds: new Set([103]) });
    expect(out.map(e => e.slotId)).toEqual([103]);
  });

  it('seleccionar B1 imprime SOLO B1 — no también P1, aunque compartan el número', () => {
    // Antes la selección viajaba como números sueltos: {1} matcheaba P1 y B1.
    const out = etiquetasDeLaSeleccion(etiquetas, { stateKey: 'X__ana', slotIds: new Set([101]) });
    expect(out.map(e => `${e.tipo}${e.palletNum}`)).toEqual(['B1']);
  });

  it('no se cuela la etiqueta de otro encargado', () => {
    const out = etiquetasDeLaSeleccion(etiquetas, { stateKey: 'X__ana', slotIds: new Set([200, 103]) });
    expect(out.map(e => e.slotId)).toEqual([103]);
  });

  it('una selección vacía no imprime nada (nunca "todas" por defecto)', () => {
    expect(etiquetasDeLaSeleccion(etiquetas, { stateKey: 'X__ana', slotIds: new Set() })).toEqual([]);
  });
});
