import { describe, it, expect } from 'vitest';
import {
  pesoChocolate, dimsChocolate, pesoChocolateValido,
  CHOCOLATE_DIMS, CHOCOLATE_PESO_MAX, CHOCOLATE_PESO_DEFECTO,
} from '../chocolate';
import { sumPeso } from '../combineUtils';

describe('pesoChocolate — respeta a quien pesó', () => {
  it('usa el peso del slot cuando alguien lo pesó', () => {
    expect(pesoChocolate({ peso_kg: 18 })).toBe(18);
    expect(pesoChocolate({ peso_kg: 18.5 })).toBe(18.5);
    expect(pesoChocolate({ peso_kg: 25 })).toBe(25);
  });

  it('sin peso cae en el de siempre, así nada cambia para quien no pesa', () => {
    expect(pesoChocolate({ peso_kg: null })).toBe(CHOCOLATE_PESO_DEFECTO);
    expect(pesoChocolate({})).toBe(CHOCOLATE_PESO_DEFECTO);
    expect(pesoChocolate(null)).toBe(CHOCOLATE_PESO_DEFECTO);
    expect(pesoChocolate(undefined)).toBe(CHOCOLATE_PESO_DEFECTO);
  });

  it('el 0 es "sin pesar", NO cero kilos', () => {
    // Una balanza en cero es una balanza que nadie usó. Misma lectura que sinPesar.ts.
    expect(pesoChocolate({ peso_kg: 0 })).toBe(CHOCOLATE_PESO_DEFECTO);
  });

  it('un valor corrupto no se propaga como peso', () => {
    expect(pesoChocolate({ peso_kg: NaN })).toBe(CHOCOLATE_PESO_DEFECTO);
    expect(pesoChocolate({ peso_kg: -5 })).toBe(CHOCOLATE_PESO_DEFECTO);
    expect(pesoChocolate({ peso_kg: Infinity })).toBe(CHOCOLATE_PESO_DEFECTO);
  });
});

describe('dimsChocolate', () => {
  it('son las medidas oficiales', () => {
    expect(dimsChocolate()).toEqual({ alto: 42, largo: 80, ancho: 56 });
  });

  it('devuelve una copia: nadie puede mutar la constante compartida', () => {
    const d = dimsChocolate();
    d.alto = 999;
    expect(CHOCOLATE_DIMS.alto).toBe(42);
    expect(dimsChocolate().alto).toBe(42);
  });
});

describe('sumar un CH a un pallet acumula el peso REAL', () => {
  // El pedido era "que estos Kg se sumen cuando suman un CH a un palet". `sumPeso` ya acumulaba
  // bien; lo que estaba mal era el peso de ENTRADA — siempre 20, aunque el bulto pesara 18.
  it('el pallet queda con la suma de los pesos pesados, no de los inventados', () => {
    const ch1 = pesoChocolate({ peso_kg: 18 });
    const ch2 = pesoChocolate({ peso_kg: 16.5 });
    expect(sumPeso(ch1, ch2)).toBe(34.5);
    // Antes los dos entraban como 20 y el pallet decía 40 — 5,5 kg de más.
    expect(sumPeso(ch1, ch2)).not.toBe(CHOCOLATE_PESO_DEFECTO * 2);
  });

  it('un chocolate sin pesar sigue aportando el valor de siempre', () => {
    expect(sumPeso(pesoChocolate({ peso_kg: 18 }), pesoChocolate({}))).toBe(38);
  });

  it('sumar varios no arrastra coma flotante', () => {
    const pesos = [18.1, 16.2, 19.3].map(p => pesoChocolate({ peso_kg: p }));
    expect(pesos.reduce((a, b) => sumPeso(a, b), 0)).toBe(53.6);
  });
});

describe('pesoChocolateValido — rechaza, no recorta', () => {
  it('acepta un peso razonable', () => {
    expect(pesoChocolateValido(18)).toEqual({ ok: true, peso: 18 });
    expect(pesoChocolateValido('18,5')).toEqual({ ok: true, peso: 18.5 });  // teclado en español
    expect(pesoChocolateValido('18.5')).toEqual({ ok: true, peso: 18.5 });
  });

  it('el máximo entra; pasarse, no', () => {
    expect(pesoChocolateValido(CHOCOLATE_PESO_MAX).ok).toBe(true);
    expect(pesoChocolateValido(CHOCOLATE_PESO_MAX + 0.1).ok).toBe(false);
  });

  it('30 kg se RECHAZA con mensaje, no se recorta a 25 en silencio', () => {
    // Recortar convierte un error visible en un dato falso que nadie vuelve a revisar.
    const r = pesoChocolateValido(30);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('25');
      expect(r.error).toContain('correcto');
    }
    expect(r).not.toHaveProperty('peso');
  });

  it('vacío o basura piden que escriban el peso', () => {
    for (const v of ['', '   ', 'abc', null, undefined, 0, -3]) {
      const r = pesoChocolateValido(v);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('kg');
    }
  });
});
