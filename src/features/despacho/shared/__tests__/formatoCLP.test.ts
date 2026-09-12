import { describe, it, expect } from 'vitest';
import { formatCLP, formatCLPCorto } from '../formatoCLP';

// Intl con es-CL usa punto como separador de miles y coma decimal.
const limpia = (s: string) => s.replace(/ /g, ' ');

describe('formatCLP', () => {
  it('escribe el monto completo con separador de miles', () => {
    expect(limpia(formatCLP(25259000))).toBe('$25.259.000');
  });

  it('redondea a peso, sin decimales', () => {
    expect(limpia(formatCLP(1499.6))).toBe('$1.500');
  });

  it('el cero y la basura no rompen la franja', () => {
    expect(limpia(formatCLP(0))).toBe('$0');
    expect(formatCLP(NaN)).toBe('$0');
  });
});

describe('formatCLPCorto', () => {
  it('el caso que se veía como $25259K', () => {
    expect(formatCLPCorto(25259000)).toBe('$25,3 M');
  });

  it('bajo un millón se escribe completo (no "$0,8 M")', () => {
    expect(limpia(formatCLPCorto(840000))).toBe('$840.000');
  });

  it('sobre cien millones el decimal ya no aporta', () => {
    expect(formatCLPCorto(134500000)).toBe('$135 M');
  });

  it('el millón justo cruza al formato corto', () => {
    expect(formatCLPCorto(1000000)).toBe('$1,0 M');
  });
});
