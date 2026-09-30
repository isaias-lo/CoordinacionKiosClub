import { describe, it, expect } from 'vitest';
import { fechaDespachoBodega } from '../fechaLocal';

describe('fechaDespachoBodega — de acá sale el id de cada fila', () => {
  it('si hay una fecha elegida, manda esa', () => {
    expect(fechaDespachoBodega('2026-10-15')).toBe('2026-10-15');
  });

  it('sin fecha elegida, mañana', () => {
    expect(fechaDespachoBodega(null, new Date('2026-09-30T12:00:00-03:00'))).toBe('2026-10-01');
  });

  it('cruza fin de mes', () => {
    expect(fechaDespachoBodega(null, new Date('2026-09-30T20:00:00-03:00'))).toBe('2026-10-01');
    expect(fechaDespachoBodega(null, new Date('2026-12-31T10:00:00-03:00'))).toBe('2027-01-01');
  });

  it('LO QUE DE VERDAD PROTEGE: dos llamadas del mismo día dan lo mismo', () => {
    // De esta fecha sale el `stamp` del id (`${orden}${cod}${stamp}${prefijo}`), y de la igualdad
    // de ese id depende que registrar UNA tienda y después el día entero no duplique nada. Si el
    // botón y el modal calcularan "mañana" cada uno por su lado, una corrida a las 23:59 y otra a
    // las 00:01 darían ids distintos y la tienda saldría dos veces.
    const a = fechaDespachoBodega(null, new Date('2026-09-30T08:00:00-03:00'));
    const b = fechaDespachoBodega(null, new Date('2026-09-30T23:59:00-03:00'));
    expect(a).toBe(b);
  });

  it('una cadena vacía cuenta como "no elegida"', () => {
    expect(fechaDespachoBodega('', new Date('2026-09-30T12:00:00-03:00'))).toBe('2026-10-01');
  });
});
