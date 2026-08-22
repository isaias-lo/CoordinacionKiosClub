import { describe, it, expect, vi } from 'vitest';

// El módulo inicializa el cliente browser de Supabase al importar; lo mockeamos para el test puro.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { remotoEsMasViejo } from '../userSessionState';

// [C3/RC-6] Gate de orden: ¿descarto este remoto por ser más viejo que lo último que incorporé?
// Prefiere el reloj del SERVIDOR (updated_at); cae al pushedAt del cliente si no está.
describe('remotoEsMasViejo', () => {
  it('con reloj de servidor en ambos: descarta el remoto más VIEJO', () => {
    expect(remotoEsMasViejo(90, 100, undefined, 0)).toBe(true);   // remoto 90 < mío 100 → descartar
  });

  it('con reloj de servidor en ambos: NO descarta el remoto más NUEVO', () => {
    expect(remotoEsMasViejo(110, 100, undefined, 0)).toBe(false); // remoto 110 > mío 100 → aplicar
  });

  it('con reloj de servidor en ambos: iguales → no descarta (lo resuelve el chequeo "ya sincronizado")', () => {
    expect(remotoEsMasViejo(100, 100, undefined, 0)).toBe(false);
  });

  it('el reloj de SERVIDOR tiene prioridad sobre el pushedAt del cliente', () => {
    // Server dice que el remoto es más nuevo (110 > 90) aunque el pushedAt del cliente diría lo
    // contrario (1 < 999). Gana el servidor → no descarta.
    expect(remotoEsMasViejo(110, 90, 1, 999)).toBe(false);
  });

  it('sin reloj de servidor (legacy): cae al pushedAt del cliente — descarta el más viejo', () => {
    expect(remotoEsMasViejo(undefined, 100, 50, 60)).toBe(true);  // pushedAt 50 < 60 → descartar
    expect(remotoEsMasViejo(null, 100, 70, 60)).toBe(false);      // pushedAt 70 > 60 → aplicar
  });

  it('remoto con server stamp pero yo todavía sin incorporar nada (ultimoServerStamp=0): cae al pushedAt', () => {
    expect(remotoEsMasViejo(100, 0, 50, 60)).toBe(true);   // 50 < 60 → descartar (por pushedAt)
    expect(remotoEsMasViejo(100, 0, 80, 60)).toBe(false);  // 80 > 60 → aplicar
  });

  it('sin ningún timestamp (primer remoto): nunca descarta', () => {
    expect(remotoEsMasViejo(undefined, 0, undefined, 0)).toBe(false);
    expect(remotoEsMasViejo(null, 0, null, 0)).toBe(false);
  });
});
