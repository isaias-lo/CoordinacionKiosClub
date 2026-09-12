import { describe, it, expect } from 'vitest';
import { textoRegistrar } from '../textoRegistrar';

describe('textoRegistrar', () => {
  it('dice cuántas cajas y sobre qué tienda', () => {
    expect(textoRegistrar(3, 1, '16PQA')).toBe('Registrar 4 cajas · 16 PQA');
  });

  it('una sola caja va en singular', () => {
    expect(textoRegistrar(1, 0, '22LGN')).toBe('Registrar 1 caja · 22 LGN');
  });

  it('sin cajas igual nombra la tienda (el botón está deshabilitado)', () => {
    expect(textoRegistrar(0, 0, '02SCL')).toBe('Registrar 0 cajas · 02 SCL');
  });

  it('ignora valores negativos en vez de restar', () => {
    expect(textoRegistrar(-2, 3, '16PQA')).toBe('Registrar 3 cajas · 16 PQA');
  });

  it('las dos tiendas que se confundieron quedan distinguibles en el botón', () => {
    expect(textoRegistrar(13, 0, '22LGN')).not.toBe(textoRegistrar(4, 0, '16PQA'));
  });
});
