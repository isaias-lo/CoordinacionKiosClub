import { describe, it, expect } from 'vitest';
import { esTrabajo, normalizar, parejasDeCelda } from '../parejasCelda';
import { normalizar as normalizarDelRegistro } from '../registroOlas';
import type { MovimientoPlanilla } from '../armarPlanilla';

// Los casos son los reales de noviembre, verificados contra Odoo: la Comida de 62PLD el 18/11 y
// el Hogar de 62PLD el 02/11, que es el techo del mes.

function mov(p: Partial<MovimientoPlanilla> = {}): MovimientoPlanilla {
  return {
    cod: '62PLD', seccion: 'Comida', registros: 30, picker: 'Sebasthian Cortez',
    cuenta: 'Adquisiciones', asignadoEn: '2026-11-18 11:00:00', validadoEn: null,
    estado: 'done', ...p,
  };
}

describe('parejasDeCelda', () => {
  it('una persona con una cuenta es un solo par, con sus registros sumados', () => {
    const p = parejasDeCelda([mov({ registros: 30 }), mov({ registros: 54 })], '62PLD', 'Comida');
    expect(p).toEqual([{ persona: 'Sebasthian Cortez', cuenta: 'Adquisiciones', registros: 84 }]);
  });

  it('el caso del 18/11: la Comida de 62PLD la hicieron dos cuentas, y son dos pares', () => {
    const p = parejasDeCelda([
      mov({ picker: 'Sebasthian Cortez', cuenta: 'Adquisiciones', registros: 40 }),
      mov({ picker: 'Marcelo Vergara', cuenta: 'Pickers 7', registros: 20 }),
    ], '62PLD', 'Comida');
    expect(p.map(x => [x.persona, x.cuenta])).toEqual([
      ['Sebasthian Cortez', 'Adquisiciones'],
      ['Marcelo Vergara', 'Pickers 7'],
    ]);
  });

  it('va del que más trabajó al que menos', () => {
    const p = parejasDeCelda([
      mov({ picker: 'Sebasthian Cortez', cuenta: 'Adquisiciones', registros: 10 }),
      mov({ picker: 'Marcelo Vergara', cuenta: 'Pickers 7', registros: 60 }),
    ], '62PLD', 'Comida');
    expect(p[0].persona).toBe('Marcelo Vergara');
  });

  it('a igual volumen ordena por nombre, no por cuál llegó primero', () => {
    // El orden de llegada cambia de una consulta a otra; el resultado no puede cambiar con él.
    const a = mov({ picker: 'Zervens Louissant', cuenta: 'Pickers 14', registros: 20 });
    const b = mov({ picker: 'Marcelo Vergara', cuenta: 'Pickers 7', registros: 20 });
    expect(parejasDeCelda([a, b], '62PLD', 'Comida')).toEqual(parejasDeCelda([b, a], '62PLD', 'Comida'));
    expect(parejasDeCelda([a, b], '62PLD', 'Comida')[0].persona).toBe('Marcelo Vergara');
  });

  it('la misma persona con dos cuentas es dos pares: cada cuenta necesita su fila', () => {
    // La cuenta es la llave con que la hoja del bono busca el nombre. Con una sola fila, una de
    // las dos cuentas no quedaría escrita en ninguna parte.
    const p = parejasDeCelda([
      mov({ picker: 'Marcelo Vergara', cuenta: 'Pickers 7', registros: 30 }),
      mov({ picker: 'Marcelo Vergara', cuenta: 'Adquisiciones', registros: 10 }),
    ], '62PLD', 'Comida');
    expect(p.map(x => x.cuenta)).toEqual(['Pickers 7', 'Adquisiciones']);
  });

  it('dos personas con la misma cuenta son dos pares', () => {
    // Pasa cuando el coordinador corrige un movimiento: «la pistola era de Marcelo, la usó Juliette».
    const p = parejasDeCelda([
      mov({ picker: 'Marcelo Vergara', cuenta: 'Pickers 7', registros: 30 }),
      mov({ picker: 'Juliette Mendoza', cuenta: 'Pickers 7', registros: 10 }),
    ], '62PLD', 'Comida');
    expect(p.map(x => x.persona)).toEqual(['Marcelo Vergara', 'Juliette Mendoza']);
  });

  it('una línea agregada a mano, sin cuenta, se suma al par de esa persona y no abre otro', () => {
    // Si abriera un par aparte, una corrección a mano le inventaría a la tienda una fila de más.
    const p = parejasDeCelda([
      mov({ registros: 30 }),
      mov({ cuenta: undefined, registros: 5 }),
    ], '62PLD', 'Comida');
    expect(p).toEqual([{ persona: 'Sebasthian Cortez', cuenta: 'Adquisiciones', registros: 35 }]);
  });

  it('si la persona no tiene otra línea, la que se agregó a mano forma su par, sin cuenta', () => {
    const p = parejasDeCelda([
      mov({ registros: 30 }),
      mov({ picker: 'Marcelo Vergara', cuenta: undefined, registros: 5 }),
    ], '62PLD', 'Comida');
    expect(p).toEqual([
      { persona: 'Sebasthian Cortez', cuenta: 'Adquisiciones', registros: 30 },
      { persona: 'Marcelo Vergara', cuenta: '', registros: 5 },
    ]);
  });

  it('con dos cuentas de la misma persona, la línea a mano va al par de más volumen', () => {
    const p = parejasDeCelda([
      mov({ picker: 'Marcelo Vergara', cuenta: 'Adquisiciones', registros: 10 }),
      mov({ picker: 'Marcelo Vergara', cuenta: 'Pickers 7', registros: 30 }),
      mov({ picker: 'Marcelo Vergara', cuenta: undefined, registros: 4 }),
    ], '62PLD', 'Comida');
    expect(p).toEqual([
      { persona: 'Marcelo Vergara', cuenta: 'Pickers 7', registros: 34 },
      { persona: 'Marcelo Vergara', cuenta: 'Adquisiciones', registros: 10 },
    ]);
  });

  it('solo cuenta trabajo: hecho o asignado, y con alguien', () => {
    const p = parejasDeCelda([
      mov({ picker: 'Anulado', cuenta: 'Pickers 1', estado: 'cancel' }),
      mov({ picker: 'Sin reservar', cuenta: 'Pickers 2', estado: 'confirmed' }),
      mov({ picker: '', cuenta: 'Pickers 3', estado: 'assigned' }),
      mov({ picker: '   ', cuenta: 'Pickers 4', estado: 'done' }),
      mov({ picker: 'Asignado', cuenta: 'Pickers 5', estado: 'assigned' }),
    ], '62PLD', 'Comida');
    expect(p.map(x => x.persona)).toEqual(['Asignado']);
  });

  it('solo la tienda y la sección que se piden', () => {
    const p = parejasDeCelda([
      mov({ picker: 'Otra tienda', cod: '01TPS' }),
      mov({ picker: 'Otra sección', seccion: 'Aseo' }),
      mov({ picker: 'La que es' }),
    ], '62PLD', 'Comida');
    expect(p.map(x => x.persona)).toEqual(['La que es']);
  });

  it('calza la tienda aunque la Ñ venga distinta', () => {
    expect(parejasDeCelda([mov({ cod: '37VIÑ' })], '37VIN', 'Comida')).toHaveLength(1);
    expect(parejasDeCelda([mov({ cod: '37VIN' })], '37VIÑ', 'Comida')).toHaveLength(1);
  });

  it('el techo del mes: el Hogar de 62PLD del 02/11 son cinco pares', () => {
    // «Abastecimiento Apertura Hogar 1» a «Hogar 5», cada uno con su cuenta. Verificado en Odoo.
    const cuentas = ['Pickers 15', 'Pickers 2', 'Pickers 9', 'Pickers 14', 'Pickers 18'];
    const p = parejasDeCelda(
      cuentas.map((c, i) => mov({ seccion: 'Hogar', picker: `Persona ${i}`, cuenta: c })),
      '62PLD', 'Hogar');
    expect(p).toHaveLength(5);
    expect(new Set(p.map(x => x.cuenta))).toEqual(new Set(cuentas));
  });

  it('sin movimientos no hay pares', () => {
    expect(parejasDeCelda([], '62PLD', 'Comida')).toEqual([]);
  });
});

describe('esTrabajo', () => {
  it('hecho o asignado, con alguien: sí', () => {
    expect(esTrabajo(mov({ estado: 'done' }))).toBe(true);
    expect(esTrabajo(mov({ estado: 'assigned' }))).toBe(true);
  });

  it('anulado, sin reservar o sin persona: no', () => {
    expect(esTrabajo(mov({ estado: 'cancel' }))).toBe(false);
    expect(esTrabajo(mov({ estado: 'confirmed' }))).toBe(false);
    expect(esTrabajo(mov({ picker: '' }))).toBe(false);
    expect(esTrabajo(mov({ picker: '  ' }))).toBe(false);
  });
});

describe('normalizar', () => {
  it('es la misma función que exporta el registro, no una copia', () => {
    // Se mudó acá el 21/11/2026 para que el esqueleto pudiera usarla sin un ciclo de imports. Dos
    // copias de la regla que compara la hoja con la app podrían separarse sin que nadie lo note.
    expect(normalizarDelRegistro).toBe(normalizar);
  });

  it('ignora acentos, mayúsculas y espacios al borde', () => {
    expect(normalizar('ASEO ')).toBe('ASEO');
    expect(normalizar('Simón Sabathier')).toBe('SIMON SABATHIER');
  });
});
