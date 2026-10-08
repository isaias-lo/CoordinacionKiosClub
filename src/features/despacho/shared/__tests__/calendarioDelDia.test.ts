import { describe, it, expect } from 'vitest';
import { claveDelDia, tiendasPlanificadas, marcaDeCalendario, CLAVES_POR_DIA } from '../calendarioDelDia';

// ── EL CASO 38SP2 DEL 07/10/2026 ──────────────────────────────────────────────────────────────
//
// Apareció en CRUCE PESOS una tienda que no estaba en el calendario del día, y nadie tenía cómo
// saber por qué. El 07/10 cayó MIÉRCOLES, y 38SP2 no estaba en el `fal` del miércoles —
// verificado contra `calendario_central`, que ese día tenía 18 rm + 3 fal + 0 costa.
//
// El calendario NO filtra el cruce, a propósito: es el PLAN y Odoo es el HECHO, así que filtrar
// los hechos por el plan esconde en silencio una tienda despachada sin estar planificada. Lo que
// corresponde es MARCARLA.

/** Un calendario como el de la base: una clave por día, tres zonas dentro. */
const CAL = {
  MI: { rm: ['01TPS', '16PQA'], fal: ['36CHL', '47PTV'], costa: [] },
  JU: { rm: ['26ALC'], fal: ['38SP2'], costa: ['08RNC'] },
};

describe('claveDelDia', () => {
  it('EL CASO: el 07/10/2026 fue miércoles', () => {
    expect(claveDelDia('2026-10-07')).toBe('MI');
  });

  it('NO usa `new Date(iso)`, que en Chile devuelve el día anterior', () => {
    // El mismo tropiezo que documenta `todayISO()`: `new Date('2026-10-07')` es medianoche UTC,
    // o sea las 21:00 del 06 en Chile. Si esto se rompe, toda la columna se corre un día.
    expect(claveDelDia('2026-10-05')).toBe('LU');
    expect(claveDelDia('2026-10-11')).toBe('DO');
    expect(claveDelDia('2026-10-10')).toBe('SA');
  });

  it('una fecha mal escrita no inventa un día', () => {
    expect(claveDelDia('07/10/2026')).toBeNull();
    expect(claveDelDia('')).toBeNull();
  });

  it('las siete claves, en el orden de getDay()', () => {
    expect(CLAVES_POR_DIA).toEqual(['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA']);
  });
});

describe('tiendasPlanificadas', () => {
  it('EL CASO: 38SP2 no estaba el miércoles, pero sí el jueves', () => {
    expect(tiendasPlanificadas(CAL, '2026-10-07')?.has('38SP2')).toBe(false);
    expect(tiendasPlanificadas(CAL, '2026-10-08')?.has('38SP2')).toBe(true);
  });

  it('junta las TRES zonas, no solo rm', () => {
    const j = tiendasPlanificadas(CAL, '2026-10-08');
    expect(j).toEqual(new Set(['26ALC', '38SP2', '08RNC']));
  });

  it('los ADELANTOS cuentan como planificados', () => {
    // 34SMB se adelantó al 05/10 desde Config. Sin esto saldría «No» y sería mentira.
    const l = tiendasPlanificadas(CAL, '2026-10-07', ['34SMB']);
    expect(l?.has('34SMB')).toBe(true);
  });

  it('normaliza el código: la lista se carga a mano', () => {
    expect(tiendasPlanificadas(CAL, '2026-10-07', ['  34smb '])?.has('34SMB')).toBe(true);
  });

  it('SIN CALENDARIO devuelve null, no un conjunto vacío', () => {
    // Un vacío diría «ese día no había ninguna tienda» y pondría «No» en todas las filas. Es una
    // afirmación distinta, y nadie la verificó.
    expect(tiendasPlanificadas(null, '2026-10-07')).toBeNull();
    expect(tiendasPlanificadas({}, '2026-10-07')).toBeNull();
    expect(tiendasPlanificadas(CAL, 'no-es-fecha')).toBeNull();
  });
});

describe('marcaDeCalendario — lo que va a la hoja', () => {
  it('EL CASO: 38SP2 el miércoles sale «No»', () => {
    expect(marcaDeCalendario(tiendasPlanificadas(CAL, '2026-10-07'), '38SP2')).toBe('No');
  });

  it('una planificada sale «Sí»', () => {
    expect(marcaDeCalendario(tiendasPlanificadas(CAL, '2026-10-07'), '16PQA')).toBe('Sí');
  });

  it('sin calendario la celda queda EN BLANCO, no «No»', () => {
    expect(marcaDeCalendario(null, '38SP2')).toBe('');
  });
});
