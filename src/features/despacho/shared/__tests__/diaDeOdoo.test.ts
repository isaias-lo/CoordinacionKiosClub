import { describe, it, expect } from 'vitest';
import { diaParaConsultarOdoo, pideOtroDia } from '../diaDeOdoo';

const HOY = '2026-10-31';      // el sábado de 62PLD
const VIERNES = '2026-10-30';  // donde están sus 16 movimientos

describe('diaParaConsultarOdoo · lo que ya funcionaba sigue igual', () => {
  it('sin cuerpo, hoy', () => {
    expect(diaParaConsultarOdoo(null, HOY)).toBe(HOY);
    expect(diaParaConsultarOdoo(undefined, HOY)).toBe(HOY);
    expect(diaParaConsultarOdoo({}, HOY)).toBe(HOY);
  });

  it('una pantalla vieja que no manda `fecha` se comporta como antes', () => {
    expect(diaParaConsultarOdoo({ fecha: undefined }, HOY)).toBe(HOY);
  });
});

describe('diaParaConsultarOdoo · el caso de 62PLD', () => {
  it('pide el viernes 30 y lo devuelve', () => {
    expect(diaParaConsultarOdoo({ fecha: VIERNES }, HOY)).toBe(VIERNES);
  });

  it('63CAL: tres días atrás también entra', () => {
    expect(diaParaConsultarOdoo({ fecha: '2026-10-28' }, HOY)).toBe('2026-10-28');
  });

  it('el borde de la ventana: 7 días atrás sí, 8 no', () => {
    expect(diaParaConsultarOdoo({ fecha: '2026-10-24' }, HOY)).toBe('2026-10-24');
    expect(diaParaConsultarOdoo({ fecha: '2026-10-23' }, HOY)).toBe(HOY);
  });
});

describe('diaParaConsultarOdoo · lo que manda un cliente no se cree', () => {
  it('EL FUTURO NUNCA: pedir mañana cae en hoy', () => {
    // Mirar un día que no llegó es inventar carga. Es el mismo control del día de trabajo.
    expect(diaParaConsultarOdoo({ fecha: '2026-11-01' }, HOY)).toBe(HOY);
    expect(diaParaConsultarOdoo({ fecha: '2027-01-01' }, HOY)).toBe(HOY);
  });

  it('cualquier cosa que no sea una fecha cae en hoy, sin romperse', () => {
    for (const basura of [123, true, null, {}, [], 'ayer', '31/10/2026', '', '   ']) {
      expect(diaParaConsultarOdoo({ fecha: basura }, HOY)).toBe(HOY);
    }
  });

  it('un día muy viejo cae en hoy, no abre una ventana cualquiera', () => {
    expect(diaParaConsultarOdoo({ fecha: '2020-01-01' }, HOY)).toBe(HOY);
  });

  it('la ventana se puede ajustar sin tocar la función', () => {
    expect(diaParaConsultarOdoo({ fecha: '2026-10-28' }, HOY, 2)).toBe(HOY);
    expect(diaParaConsultarOdoo({ fecha: '2026-10-28' }, HOY, 3)).toBe('2026-10-28');
  });
});

describe('pideOtroDia', () => {
  it('distingue el día pedido de hoy', () => {
    expect(pideOtroDia({ fecha: VIERNES }, HOY)).toBe(true);
    expect(pideOtroDia({ fecha: HOY }, HOY)).toBe(false);
    expect(pideOtroDia(null, HOY)).toBe(false);
  });

  it('un día rechazado NO cuenta como otro día', () => {
    // Cae en hoy, así que para todo lo demás es una petición de hoy.
    expect(pideOtroDia({ fecha: '2026-11-05' }, HOY)).toBe(false);
    expect(pideOtroDia({ fecha: 'basura' }, HOY)).toBe(false);
  });
});
