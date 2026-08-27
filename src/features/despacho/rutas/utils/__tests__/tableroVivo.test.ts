import { describe, it, expect } from 'vitest';
import { minutoChile, ahoraMinutoChile, esTipoCarga, filaAUnidad, unidadesDesdeFilas } from '../tableroVivo';

// Chile: invierno (abr–sep) UTC-4, verano (sep–abr) UTC-3. `minutoChile` debe dar el minuto LOCAL,
// no el UTC — de eso depende que el corte de las 15:00 del motor no quede corrido varias horas.
describe('minutoChile', () => {
  it('convierte UTC a hora de Chile en invierno (UTC-4)', () => {
    // 12:00 UTC en agosto → 08:00 en Santiago → 480 min
    expect(minutoChile('2026-08-27T12:00:00Z')).toBe(8 * 60);
  });
  it('respeta el horario de verano de Chile (UTC-3)', () => {
    // 12:00 UTC en enero → 09:00 en Santiago → 540 min (offset distinto: prueba que NO hardcodea)
    expect(minutoChile('2026-01-15T12:00:00Z')).toBe(9 * 60);
  });
  it('cruza a la medianoche hacia el día anterior', () => {
    // 02:00 UTC en agosto → 22:00 del día anterior en Santiago → 1320 min
    expect(minutoChile('2026-08-27T02:00:00Z')).toBe(22 * 60);
  });
  it('medianoche local cae en 0, no en 1440', () => {
    // 04:00 UTC en agosto (UTC-4) → 00:00 en Santiago
    expect(minutoChile('2026-08-27T04:00:00Z')).toBe(0);
  });
  it('devuelve NaN ante timestamp vacío o basura', () => {
    expect(minutoChile('')).toBeNaN();
    expect(minutoChile(null)).toBeNaN();
    expect(minutoChile(undefined)).toBeNaN();
    expect(minutoChile('no es fecha')).toBeNaN();
  });
});

describe('ahoraMinutoChile', () => {
  it('da un minuto del día válido (0..1439)', () => {
    const m = ahoraMinutoChile(new Date('2026-08-27T18:30:00Z')); // 14:30 Santiago
    expect(m).toBe(14 * 60 + 30);
  });
});

describe('esTipoCarga', () => {
  it('acepta P/B/C/CH y rechaza el resto', () => {
    for (const t of ['P', 'B', 'C', 'CH']) expect(esTipoCarga(t)).toBe(true);
    for (const t of ['X', 'p', '', 'PP']) expect(esTipoCarga(t)).toBe(false);
  });
});

describe('filaAUnidad', () => {
  it('mapea una fila válida a UnidadSalida con el minuto en hora de Chile', () => {
    expect(filaAUnidad({ store_cod: '26ALC', tipo: 'P', created_at: '2026-08-27T12:00:00Z' }))
      .toEqual({ cod: '26ALC', tipo: 'P', minuto: 480 });
  });
  it('normaliza el tipo a mayúsculas y recorta el código', () => {
    expect(filaAUnidad({ store_cod: '  57CAS ', tipo: 'ch', created_at: '2026-08-27T13:00:00Z' }))
      .toEqual({ cod: '57CAS', tipo: 'CH', minuto: 9 * 60 });
  });
  it('descarta fila sin código, con tipo inválido o con fecha ilegible', () => {
    expect(filaAUnidad({ store_cod: '', tipo: 'P', created_at: '2026-08-27T12:00:00Z' })).toBeNull();
    expect(filaAUnidad({ store_cod: 'A', tipo: 'X', created_at: '2026-08-27T12:00:00Z' })).toBeNull();
    expect(filaAUnidad({ store_cod: 'A', tipo: 'P', created_at: 'ayer' })).toBeNull();
    expect(filaAUnidad({ store_cod: 'A', tipo: 'P', created_at: null })).toBeNull();
  });
});

describe('unidadesDesdeFilas', () => {
  it('mapea las válidas y descarta las inválidas', () => {
    const filas = [
      { store_cod: 'A', tipo: 'P', created_at: '2026-08-27T12:00:00Z' },
      { store_cod: 'B', tipo: 'X', created_at: '2026-08-27T12:00:00Z' }, // tipo inválido → fuera
      { store_cod: '', tipo: 'B', created_at: '2026-08-27T12:00:00Z' },  // sin código → fuera
      { store_cod: 'C', tipo: 'b', created_at: '2026-08-27T13:00:00Z' },
    ];
    expect(unidadesDesdeFilas(filas)).toEqual([
      { cod: 'A', tipo: 'P', minuto: 480 },
      { cod: 'C', tipo: 'B', minuto: 540 },
    ]);
  });
  it('lista vacía → vacío', () => {
    expect(unidadesDesdeFilas([])).toEqual([]);
  });
});
