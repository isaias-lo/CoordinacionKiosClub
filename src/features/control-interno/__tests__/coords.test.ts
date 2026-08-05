import { describe, it, expect } from 'vitest';
import { parseCoord } from '../coords';

describe('parseCoord', () => {
  it('acepta punto decimal', () => {
    expect(parseCoord('-39.81834', 90)).toBeCloseTo(-39.81834);
    expect(parseCoord('-73.233534', 180)).toBeCloseTo(-73.233534);
  });

  it('acepta coma decimal (formato chileno) — el bug de "no guarda coordenadas"', () => {
    expect(parseCoord('-39,81834', 90)).toBeCloseTo(-39.81834);
    expect(parseCoord('-73,233534', 180)).toBeCloseTo(-73.233534);
  });

  it('vacío o incompleto → null (no rompe mientras se teclea)', () => {
    expect(parseCoord('', 90)).toBeNull();
    expect(parseCoord('-', 90)).toBeNull();
    expect(parseCoord('.', 90)).toBeNull();
    expect(parseCoord('-.', 90)).toBeNull();
  });

  it('fuera de rango → null (lat máx 90, lon máx 180)', () => {
    expect(parseCoord('120', 90)).toBeNull();   // lat inválida
    expect(parseCoord('120', 180)).toBe(120);   // lon válida
    expect(parseCoord('-200', 180)).toBeNull();
  });

  it('valor no numérico → null', () => {
    expect(parseCoord('abc', 90)).toBeNull();
    expect(parseCoord(null as unknown as string, 90)).toBeNull();
  });
});
