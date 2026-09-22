import { describe, it, expect } from 'vitest';
import { puedeAdoptar, adopcionesPendientes } from '../adoptarItemRemoto';

const fila = (p: Partial<Parameters<typeof puedeAdoptar>[0]> = {}) =>
  ({ pickingSlotId: 100, tocada: false, saved: false, ...p });

describe('el caso del 17/09: la tarjeta vacía tapaba lo del compañero', () => {
  it('una tarjeta vacía e intacta adopta el ítem que cargó el otro', () => {
    const f = fila();
    const r = adopcionesPendientes([f], [{ pickingSlotId: 100, peso: 83 }]);
    expect(r).toEqual([{ fila: f, item: { pickingSlotId: 100, peso: 83 } }]);
  });

  it('sin esto no había forma de rellenarla: es la única puerta', () => {
    // Antes la condición era `!saved`, que también es true acá — y aun así nadie la tocaba.
    expect(puedeAdoptar(fila())).toBe(true);
  });
});

describe('lo que la persona está escribiendo NO se pisa', () => {
  it('una fila tocada no adopta nada, aunque esté sin guardar', () => {
    expect(puedeAdoptar(fila({ tocada: true }))).toBe(false);
  });

  it('y por eso no aparece en las adopciones', () => {
    expect(adopcionesPendientes([fila({ tocada: true })], [{ pickingSlotId: 100 }])).toEqual([]);
  });

  it('una fila ya guardada acá tampoco: de esa se encarga la reconciliación', () => {
    expect(puedeAdoptar(fila({ saved: true }))).toBe(false);
  });
});

describe('sin unidad de Picking no hay a qué emparejar', () => {
  it.each([undefined, null])('pickingSlotId %s no adopta', (v) => {
    expect(puedeAdoptar(fila({ pickingSlotId: v }))).toBe(false);
  });

  it('un ítem remoto sin slot tampoco empareja con nadie', () => {
    expect(adopcionesPendientes([fila()], [{ pickingSlotId: null }])).toEqual([]);
  });
});

describe('emparejamiento', () => {
  it('cada fila toma el ítem de SU unidad, no el de al lado', () => {
    const a = fila({ pickingSlotId: 1 }), b = fila({ pickingSlotId: 2 });
    const r = adopcionesPendientes([a, b], [{ pickingSlotId: 2, v: 'dos' }, { pickingSlotId: 1, v: 'uno' }]);
    expect(r).toEqual([
      { fila: a, item: { pickingSlotId: 1, v: 'uno' } },
      { fila: b, item: { pickingSlotId: 2, v: 'dos' } },
    ]);
  });

  it('una fila sin ítem correspondiente se queda como está', () => {
    expect(adopcionesPendientes([fila({ pickingSlotId: 9 })], [{ pickingSlotId: 1 }])).toEqual([]);
  });

  it('sin nada que adoptar devuelve lista vacía — el llamador evita el render de más', () => {
    expect(adopcionesPendientes([fila({ tocada: true })], [])).toEqual([]);
    expect(adopcionesPendientes([], [{ pickingSlotId: 1 }])).toEqual([]);
  });

  it('devuelve las referencias originales, no copias', () => {
    const f = fila(), i = { pickingSlotId: 100 };
    const r = adopcionesPendientes([f], [i]);
    expect(r[0].fila).toBe(f);
    expect(r[0].item).toBe(i);
  });
});
