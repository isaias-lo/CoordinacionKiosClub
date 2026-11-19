import { describe, it, expect } from 'vitest';
import { auditoresPorCelda, claveCelda, fechaDeOrigen, seAuditoSolo } from '../auditores';
import type { MovimientoOdoo } from '../desdeOdoo';

const HOY = '2026-11-19';
const NOMBRES = {
  'Pickers 16': 'Christian Flores',
  'Movimiento interno': 'Josué Suazo',
  'Laura Roiatti Finato': 'Diego Echeverría',
  'Bodega Web': 'Karla Solar',
};

function crudo(p: Partial<MovimientoOdoo>): MovimientoOdoo {
  return {
    ref: '99REC/DT/153399',
    origin: 'AUDITORIA Abastecimiento Comida 53VAL 19/11/2026',
    estado: 'done', registros: 89, responsable: 'Movimiento interno',
    asignadoEn: null, validadoEn: '2026-11-19 16:38:03', dia: HOY,
    toLocation: '', partner: '', ...p,
  };
}
const dias = (extra: Record<string, string> = {}): Map<string, string> => {
  const m = new Map<string, string>();
  for (const cod of ['53VAL', '62PLD', '76PAN', '09LEO']) m.set(cod, HOY);
  for (const [cod, d] of Object.entries(extra)) m.set(cod, d);
  return m;
};

describe('fechaDeOrigen', () => {
  it('saca la fecha chilena del final del origen', () => {
    expect(fechaDeOrigen('Abastecimiento Comida 53VAL 19/11/2026')).toBe('2026-11-19');
    expect(fechaDeOrigen('AUDITORIA Abastecimiento Comida 62PLD 17/11/2026')).toBe('2026-11-17');
  });

  it('sin fecha devuelve null en vez de inventar una', () => {
    expect(fechaDeOrigen('Abastecimiento Comida 53VAL')).toBeNull();
    expect(fechaDeOrigen('')).toBeNull();
    expect(fechaDeOrigen(null)).toBeNull();
  });

  it('un año de dos dígitos no se acepta: adivinar el siglo sería inventar', () => {
    expect(fechaDeOrigen('Abastecimiento Comida 53VAL 19/11/26')).toBeNull();
  });

  it('un mes imposible no pasa', () => {
    expect(fechaDeOrigen('Abastecimiento Comida 53VAL 19/13/2026')).toBeNull();
  });
});

describe('auditoresPorCelda', () => {
  it('el caso real del 19/11: Josué auditó lo que pickeó Christian Flores', () => {
    const m = auditoresPorCelda([crudo({})], NOMBRES, dias());
    expect(m.get(claveCelda('53VAL', 'Comida'))).toEqual([
      { nombre: 'Josué Suazo', cuenta: 'Movimiento interno', hora: '13:38' },
    ]);
  });

  it('la errata «AUDIOTORIA» también cuenta como auditoría', () => {
    const m = auditoresPorCelda(
      [crudo({ origin: 'AUDIOTORIA Abastecimiento Comida 53VAL 19/11/2026' })], NOMBRES, dias());
    expect(m.get(claveCelda('53VAL', 'Comida'))).toHaveLength(1);
  });

  it('un movimiento de trabajo NO entra: es la contracara de movimientosDesdeOdoo', () => {
    const m = auditoresPorCelda(
      [crudo({ origin: 'Abastecimiento Comida 53VAL 19/11/2026', responsable: 'Pickers 16' })],
      NOMBRES, dias());
    expect(m.size).toBe(0);
  });

  it('la auditoría de OTRO día no cae en la celda de hoy', () => {
    // 99REC/DT/153125, creada el 18/11 y con el origen del 17. Emparejando por el día en que se
    // hizo caía en la celda del 18, que ya tenía otro auditor.
    const m = auditoresPorCelda([crudo({
      origin: 'AUDITORIA Abastecimiento Comida 62PLD 17/11/2026',
      responsable: 'Laura Roiatti Finato', dia: HOY,
    })], NOMBRES, dias());
    expect(m.size).toBe(0);
  });

  it('una apertura se empareja con el día de SUS movimientos', () => {
    const m = auditoresPorCelda([crudo({
      origin: 'AUDITORIA Abastecimiento Comida 62PLD 30/10/2026',
      responsable: 'Laura Roiatti Finato', dia: '2026-10-30',
    })], NOMBRES, dias({ '62PLD': '2026-10-30' }));
    expect(m.get(claveCelda('62PLD', 'Comida'))?.[0].nombre).toBe('Diego Echeverría');
  });

  it('sin fecha en el origen se usa el día en que se consultó', () => {
    const m = auditoresPorCelda(
      [crudo({ origin: 'AUDITORIA Abastecimiento Comida 53VAL' })], NOMBRES, dias());
    expect(m.get(claveCelda('53VAL', 'Comida'))).toHaveLength(1);
  });

  it('la misma persona con dos auditorías de la celda va una sola vez', () => {
    // Pasó el 18/11 en 62PLD Comida: dos movimientos de auditoría, 37 y 31 líneas, mismo auditor.
    const m = auditoresPorCelda([
      crudo({ responsable: 'Laura Roiatti Finato', registros: 37 }),
      crudo({ responsable: 'Laura Roiatti Finato', registros: 31, ref: '99REC/DT/153106' }),
    ], NOMBRES, dias());
    expect(m.get(claveCelda('53VAL', 'Comida'))).toHaveLength(1);
  });

  it('dos auditores distintos sí salen los dos', () => {
    const m = auditoresPorCelda([
      crudo({ responsable: 'Laura Roiatti Finato' }),
      crudo({ responsable: 'Bodega Web', ref: '99REC/DT/153470' }),
    ], NOMBRES, dias());
    expect(m.get(claveCelda('53VAL', 'Comida'))?.map(a => a.nombre))
      .toEqual(['Diego Echeverría', 'Karla Solar']);
  });

  it('una cuenta sin nombre configurado se muestra con su cuenta, no desaparece', () => {
    const m = auditoresPorCelda([crudo({ responsable: 'Pickers 99' })], NOMBRES, dias());
    expect(m.get(claveCelda('53VAL', 'Comida'))?.[0].nombre).toBe('Pickers 99');
  });

  it('una auditoría sin responsable no dice quién auditó: no entra', () => {
    const m = auditoresPorCelda([crudo({ responsable: '' })], NOMBRES, dias());
    expect(m.size).toBe(0);
  });

  it('una tienda que no es del día se descarta', () => {
    const m = auditoresPorCelda(
      [crudo({ origin: 'AUDITORIA Abastecimiento Comida 27MCH 19/11/2026' })], NOMBRES, dias());
    expect(m.size).toBe(0);
  });

  it('congelados no es de esta planilla', () => {
    const m = auditoresPorCelda(
      [crudo({ origin: 'AUDITORIA Abastecimiento Congelados 53VAL 19/11/2026' })], NOMBRES, dias());
    expect(m.size).toBe(0);
  });

  it('sin crudos devuelve un mapa vacío', () => {
    expect(auditoresPorCelda([], NOMBRES, dias()).size).toBe(0);
  });
});

describe('seAuditoSolo', () => {
  const auditor = { nombre: 'Karla Solar', cuenta: 'Bodega Web', hora: '15:12' };

  it('el caso real del 19/11: Bodega Web pickeó y auditó 76PAN', () => {
    expect(seAuditoSolo(['Bodega Web'], auditor)).toBe(true);
  });

  it('otro auditor no se marca', () => {
    expect(seAuditoSolo(['Pickers 16'], auditor)).toBe(false);
  });

  it('compara por CUENTA, no por nombre: dos cuentas pueden mostrar la misma persona', () => {
    expect(seAuditoSolo(['Supervisor Web'], { ...auditor, nombre: 'Karla Solar' })).toBe(false);
  });

  it('una celda sin picker no se marca', () => {
    expect(seAuditoSolo([], auditor)).toBe(false);
  });
});
