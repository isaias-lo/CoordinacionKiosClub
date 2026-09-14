import { describe, it, expect } from 'vitest';
import { excesoDe, confirmacionSobreCapacidad, textoBotonCerrar, confirmacionVarios } from '../sobreCapacidad';

describe('excesoDe', () => {
  it('el caso real: caben 11 y se cargaron 12', () => {
    expect(excesoDe(12, 11)).toEqual({ pallets: 12, capacidad: 11, sobran: 1 });
  });

  it('justo en la capacidad NO es exceso', () => {
    expect(excesoDe(11, 11)).toBeNull();
  });

  it('por debajo tampoco', () => {
    expect(excesoDe(8, 11)).toBeNull();
    expect(excesoDe(0, 11)).toBeNull();
  });

  it('varios de más', () => {
    expect(excesoDe(15, 11)?.sobran).toBe(4);
  });

  it('sin capacidad declarada no se inventa un exceso', () => {
    // Un vehículo con capacidad 0 o sin dato: el número no dice nada, así que no se alarma.
    expect(excesoDe(12, 0)).toBeNull();
    expect(excesoDe(12, NaN)).toBeNull();
  });
});

describe('confirmacionSobreCapacidad', () => {
  it('dice los números reales', () => {
    const t = confirmacionSobreCapacidad('VSDR91', excesoDe(12, 11)!);
    expect(t).toContain('VSDR91');
    expect(t).toContain('12 pallets');
    expect(t).toContain('capacidad es 11');
    expect(t).toContain('1 pallet de más');
  });

  it('deja claro que el conteo NO se toca: es la duda de quien cierra', () => {
    const t = confirmacionSobreCapacidad('VSDR91', excesoDe(12, 11)!);
    expect(t).toContain('van a decir 12');
  });

  it('plural cuando sobra más de uno', () => {
    expect(confirmacionSobreCapacidad('AB1234', excesoDe(15, 11)!)).toContain('4 pallets de más');
  });

  it('termina preguntando, no afirmando', () => {
    expect(confirmacionSobreCapacidad('AB1234', excesoDe(12, 11)!).trim().endsWith('¿Cerrar el camión igual?')).toBe(true);
  });
});

describe('textoBotonCerrar', () => {
  it('con exceso lo dice: cerrar así no es la vía normal', () => {
    expect(textoBotonCerrar(true)).toContain('sobre capacidad');
  });

  it('sin exceso es el botón de siempre', () => {
    expect(textoBotonCerrar(false)).toBe('🚚 Cerrar camión y manifiesto');
  });
});

describe('confirmacionVarios', () => {
  const uno = [{ patente: 'VSDR91', exceso: excesoDe(12, 11)! }];
  const dos = [...uno, { patente: 'TYKK42', exceso: excesoDe(15, 11)! }];

  it('los nombra uno por uno: "2 camiones" no alcanza para decidir', () => {
    const t = confirmacionVarios(dos);
    expect(t).toContain('VSDR91: 12 de 11');
    expect(t).toContain('TYKK42: 15 de 11');
  });

  it('concuerda en singular y plural', () => {
    expect(confirmacionVarios(uno)).toContain('Un camión va');
    expect(confirmacionVarios(uno)).toContain('¿Cerrar igual?');
    expect(confirmacionVarios(dos)).toContain('2 camiones van');
    expect(confirmacionVarios(dos)).toContain('¿Cerrar todos igual?');
  });

  it('dice que se registran tal cual', () => {
    expect(confirmacionVarios(dos)).toContain('con los pallets que llevan');
  });
});
