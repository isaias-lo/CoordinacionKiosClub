/**
 * Property-based tests para picking-utils.
 * Verifican invariantes que los test de ejemplo no pueden cubrir exhaustivamente.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  stampFromISO,
  buildCanonicalId,
  categoriesToContenido,
  isAllowedPicker,
  fmtDuration,
  cphColor,
} from '../picking-utils';

// ─── stampFromISO ─────────────────────────────────────────────────────────────

describe('stampFromISO — propiedades', () => {
  // Generamos fechas ISO válidas para años 2000-2099
  const isoDateArb = fc.record({
    y: fc.integer({ min: 2000, max: 2099 }),
    m: fc.integer({ min: 1, max: 12 }),
    d: fc.integer({ min: 1, max: 28 }), // max 28 para evitar días inválidos en todos los meses
  }).map(({ y, m, d }) =>
    `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  );

  it('siempre produce exactamente 8 caracteres', () => {
    fc.assert(fc.property(isoDateArb, (iso) => {
      return stampFromISO(iso).length === 8;
    }));
  });

  it('el stamp contiene el año, mes y día del input en orden DDMMYYYY', () => {
    fc.assert(fc.property(isoDateArb, (iso) => {
      const [yyyy, mm, dd] = iso.split('-');
      const stamp = stampFromISO(iso);
      return stamp === `${dd}${mm}${yyyy}`;
    }));
  });

  it('fechas distintas producen stamps distintos', () => {
    fc.assert(fc.property(isoDateArb, isoDateArb, (iso1, iso2) => {
      fc.pre(iso1 !== iso2);
      return stampFromISO(iso1) !== stampFromISO(iso2);
    }));
  });
});

// ─── buildCanonicalId ─────────────────────────────────────────────────────────

describe('buildCanonicalId — propiedades', () => {
  const tipos = ['P', 'B', 'C', 'CH', 'otro'] as const;
  const DATE  = '2025-06-12';
  const REAL_CODES = ['LAS', 'VIT', 'CFL', '29CFL', '12LAS', 'MAI'] as const;

  it('seq diferentes → IDs diferentes (para mismo tipo+cod+fecha)', () => {
    fc.assert(fc.property(
      fc.constantFrom(...tipos),
      fc.integer({ min: 1, max: 500 }),
      fc.integer({ min: 1, max: 500 }),
      fc.constantFrom(...REAL_CODES),
      (tipo, seq1, seq2, cod) => {
        fc.pre(seq1 !== seq2);
        return buildCanonicalId(tipo, seq1, cod, DATE) !== buildCanonicalId(tipo, seq2, cod, DATE);
      }
    ));
  });

  it('códigos diferentes → IDs diferentes (para mismo tipo+seq+fecha)', () => {
    fc.assert(fc.property(
      fc.constantFrom(...tipos),
      fc.integer({ min: 1, max: 100 }),
      fc.constantFrom(...REAL_CODES),
      fc.constantFrom(...REAL_CODES),
      (tipo, seq, cod1, cod2) => {
        fc.pre(cod1 !== cod2);
        return buildCanonicalId(tipo, seq, cod1, DATE) !== buildCanonicalId(tipo, seq, cod2, DATE);
      }
    ));
  });

  it('tipo P siempre inicia y termina con "P"', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 999 }),
      fc.constantFrom(...REAL_CODES),
      (seq, cod) => {
        const id = buildCanonicalId('P', seq, cod, DATE);
        return id.startsWith('P') && id.endsWith('P');
      }
    ));
  });

  it('tipo B siempre termina con "B"', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 999 }),
      fc.constantFrom(...REAL_CODES),
      (seq, cod) => buildCanonicalId('B', seq, cod, DATE).endsWith('B')
    ));
  });

  it('tipo CH siempre inicia y termina con "CH"', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 999 }),
      fc.constantFrom(...REAL_CODES),
      (seq, cod) => {
        const id = buildCanonicalId('CH', seq, cod, DATE);
        return id.startsWith('CH') && id.endsWith('CH');
      }
    ));
  });

  it('tipo C siempre inicia y termina con "C"', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 999 }),
      fc.constantFrom(...REAL_CODES),
      (seq, cod) => {
        const id = buildCanonicalId('C', seq, cod, DATE);
        return id.startsWith('C') && id.endsWith('C');
      }
    ));
  });
});

// ─── categoriesToContenido ────────────────────────────────────────────────────

const CONTENIDO_VALID = new Set([
  'chocolate','completo','comida-aseo','aseo-hogar','mixto','comida','aseo','hogar',
]);

describe('categoriesToContenido — propiedades', () => {
  it('siempre devuelve uno de los 8 valores válidos de contenido', () => {
    fc.assert(fc.property(
      fc.array(fc.string(), { maxLength: 10 }),
      (cats) => CONTENIDO_VALID.has(categoriesToContenido(cats))
    ));
  });

  it('cualquier input con "chocolate" devuelve "chocolate" (prioridad absoluta)', () => {
    fc.assert(fc.property(
      fc.array(fc.string(), { maxLength: 5 }),
      (extras) => categoriesToContenido([...extras, 'Chocolates']) === 'chocolate'
    ));
  });

  it('sin "chocolate", el output nunca es "chocolate"', () => {
    fc.assert(fc.property(
      fc.array(
        fc.string().filter(s => !s.toLowerCase().includes('chocolate')),
        { maxLength: 10 }
      ),
      (cats) => categoriesToContenido(cats) !== 'chocolate'
    ));
  });
});

// ─── isAllowedPicker ──────────────────────────────────────────────────────────

describe('isAllowedPicker — propiedades', () => {
  it('Picker 1 a 18 siempre son permitidos', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 18 }),
      (n) => isAllowedPicker(`Picker ${n}`) === true
    ));
  });

  it('Picker 19 en adelante nunca son permitidos', () => {
    fc.assert(fc.property(
      fc.integer({ min: 19, max: 9999 }),
      (n) => isAllowedPicker(`Picker ${n}`) === false
    ));
  });

  it('Pickers 1 a 18 con "Pickers" (plural) también son permitidos', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 18 }),
      (n) => isAllowedPicker(`Pickers ${n}`) === true
    ));
  });

  it('nunca lanza una excepción para cualquier string', () => {
    fc.assert(fc.property(fc.string(), (s) => {
      expect(() => isAllowedPicker(s)).not.toThrow();
      return true;
    }));
  });
});

// ─── fmtDuration ─────────────────────────────────────────────────────────────

describe('fmtDuration — propiedades', () => {
  it('valores <= 0 siempre devuelven "—"', () => {
    fc.assert(fc.property(
      fc.integer({ min: -10000, max: 0 }),
      (n) => fmtDuration(n) === '—'
    ));
  });

  it('valores > 0 nunca devuelven "—"', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 10000 }),
      (n) => fmtDuration(n) !== '—'
    ));
  });

  it('minutos < 60 no contienen "h"', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 59 }),
      (n) => !fmtDuration(n).includes('h')
    ));
  });

  it('minutos >= 60 contienen "h"', () => {
    fc.assert(fc.property(
      fc.integer({ min: 60, max: 10000 }),
      (n) => fmtDuration(n).includes('h')
    ));
  });
});

// ─── cphColor ─────────────────────────────────────────────────────────────────

describe('cphColor — propiedades', () => {
  const VALID_COLORS = new Set(['#9CA3AF', '#DC2626', '#D97706', '#16A34A']);

  it('siempre devuelve uno de los 4 colores válidos', () => {
    fc.assert(fc.property(
      fc.integer({ min: -1000, max: 1000 }),
      (n) => VALID_COLORS.has(cphColor(n))
    ));
  });

  it('cph >= 90 siempre devuelve verde (#16A34A)', () => {
    fc.assert(fc.property(
      fc.integer({ min: 90, max: 10000 }),
      (n) => cphColor(n) === '#16A34A'
    ));
  });

  it('cph <= 0 siempre devuelve gris (#9CA3AF)', () => {
    fc.assert(fc.property(
      fc.integer({ min: -10000, max: 0 }),
      (n) => cphColor(n) === '#9CA3AF'
    ));
  });
});
