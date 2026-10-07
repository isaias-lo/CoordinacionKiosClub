import { describe, it, expect } from 'vitest';
import { puedeAdoptar, adopcionesPendientes, mismaCargaEscrita } from '../adoptarItemRemoto';

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

describe('una tarjeta reabierta a propósito no se cierra sola', () => {
  // Editar y unificar/sumar dejan el ítem guardado mientras la persona corrige. Si la tarjeta
  // adoptara ese mismo ítem, se cerraría en la cara de quien la abrió.
  it('reabierta con Editar no adopta', () => {
    expect(puedeAdoptar(fila({ editando: true }))).toBe(false);
    expect(adopcionesPendientes([fila({ editando: true })], [{ pickingSlotId: 100 }])).toEqual([]);
  });

  it('reabierta tras unificar o sumar no adopta', () => {
    expect(puedeAdoptar(fila({ mergeReopened: true }))).toBe(false);
  });

  it('ni siquiera con valores iguales', () => {
    const f = { ...fila({ editando: true, tocada: true }), peso: '83', alto: '' };
    expect(adopcionesPendientes([f], [{ pickingSlotId: 100, peso: 83, alto: 0 }], mismaCargaEscrita)).toEqual([]);
  });
});

describe('tarjeta tocada que dice lo mismo que lo guardado por otro equipo', () => {
  const tocada = (peso: string, alto = '', pesoPallet = '') =>
    ({ ...fila({ tocada: true }), peso, alto, pesoPallet });

  it('adopta: la unidad está guardada y la tarjeta dice exactamente eso', () => {
    const f = tocada('83', '120');
    const item = { pickingSlotId: 100, peso: 83, alto: 120 };
    expect(adopcionesPendientes([f], [item], mismaCargaEscrita)).toEqual([{ fila: f, item }]);
  });

  it('no adopta si el peso escrito es otro: eso es de la persona', () => {
    expect(adopcionesPendientes([tocada('84', '120')], [{ pickingSlotId: 100, peso: 83, alto: 120 }], mismaCargaEscrita)).toEqual([]);
  });

  it('sin comparador, una tocada sigue sin adoptar (comportamiento de antes)', () => {
    expect(adopcionesPendientes([tocada('83')], [{ pickingSlotId: 100, peso: 83 }])).toEqual([]);
  });
});

describe('mismaCargaEscrita', () => {
  it('acepta coma decimal y espacios', () => {
    expect(mismaCargaEscrita({ peso: ' 83,5 ', alto: '' }, { peso: 83.5, alto: null })).toBe(true);
  });

  it('alto vacío equivale a 0 guardado', () => {
    expect(mismaCargaEscrita({ peso: '83', alto: '' }, { peso: 83, alto: 0 })).toBe(true);
  });

  it('alto distinto no es la misma carga', () => {
    expect(mismaCargaEscrita({ peso: '83', alto: '110' }, { peso: 83, alto: 120 })).toBe(false);
  });

  it('peso vacío o cero nunca coincide', () => {
    expect(mismaCargaEscrita({ peso: '', alto: '' }, { peso: 0, alto: 0 })).toBe(false);
    expect(mismaCargaEscrita({ peso: '0', alto: '' }, { peso: 0, alto: 0 })).toBe(false);
  });

  it('item sin peso nunca coincide', () => {
    expect(mismaCargaEscrita({ peso: '83', alto: '' }, { peso: null })).toBe(false);
  });

  it('con peso del pallet no se compara: lo escrito es bruto y lo guardado neto', () => {
    expect(mismaCargaEscrita({ peso: '83', alto: '', pesoPallet: '20' }, { peso: 83 })).toBe(false);
  });
});
