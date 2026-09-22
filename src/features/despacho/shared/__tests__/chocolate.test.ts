import { describe, it, expect } from 'vitest';
import {
  pesoChocolate, dimsChocolate, pesoChocolateValido,
  CHOCOLATE_DIMS,
} from '../chocolate';
import { sumPeso } from '../combineUtils';
import { esSinPesar } from '../sinPesar';

describe('pesoChocolate — respeta a quien pesó', () => {
  it('usa el peso del slot cuando alguien lo pesó', () => {
    expect(pesoChocolate({ peso_kg: 18 })).toBe(18);
    expect(pesoChocolate({ peso_kg: 18.5 })).toBe(18.5);
    expect(pesoChocolate({ peso_kg: 25 })).toBe(25);
  });

  it('sin peso devuelve 0: el chocolate queda SIN PESAR, para que se pese en Bodega', () => {
    // El respaldo de 20 kg se quitó el 22/09/2026. Con él, un chocolate sin pesar entraba con un
    // peso inventado y quedaba indistinguible de uno pesado de verdad.
    expect(pesoChocolate({ peso_kg: null })).toBe(0);
    expect(pesoChocolate({})).toBe(0);
    expect(pesoChocolate(null)).toBe(0);
    expect(pesoChocolate(undefined)).toBe(0);
  });

  it('el 0 del slot también es "sin pesar", NO cero kilos', () => {
    // Una balanza en cero es una balanza que nadie usó. Misma lectura que sinPesar.ts.
    expect(pesoChocolate({ peso_kg: 0 })).toBe(0);
  });

  it('un valor corrupto no se propaga como peso', () => {
    expect(pesoChocolate({ peso_kg: NaN })).toBe(0);
    expect(pesoChocolate({ peso_kg: -5 })).toBe(0);
    expect(pesoChocolate({ peso_kg: Infinity })).toBe(0);
  });

  it('lo que devuelve para un chocolate sin pesar satisface esSinPesar', () => {
    // El punto entero del cambio: el chocolate tiene que poder aparecer como pendiente.
    expect(esSinPesar({ peso: pesoChocolate({}) })).toBe(true);
    expect(esSinPesar({ peso: pesoChocolate({ peso_kg: 18 }) })).toBe(false);
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
    expect(sumPeso(ch1, ch2)).not.toBe(40);   // 2 × los 20 kg del respaldo que ya no existe
  });

  it('un chocolate sin pesar no aporta kilos inventados al pallet', () => {
    // Antes sumaba 38 (18 + los 20 del respaldo). Ahora suma 18: el segundo chocolate no está
    // pesado, y el pallet no puede decir que pesa algo que nadie puso en la balanza.
    expect(sumPeso(pesoChocolate({ peso_kg: 18 }), pesoChocolate({}))).toBe(18);
  });

  it('por eso el que falta tiene que verse: cuenta como pendiente, no como 20 kg', () => {
    // El peso que no se suma no se pierde — aparece como unidad sin pesar en la tienda y en la
    // marca de la grilla, para que alguien lo pese en Bodega.
    expect(esSinPesar({ peso: pesoChocolate({}) })).toBe(true);
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

  it('ya NO hay tope de 25 kg: un peso alto se acepta', () => {
    // Quitado el 22/09/2026. Con la caja negra pesándose entera y descontándose la tara, ese
    // techo rechazaba pesos legítimos.
    expect(pesoChocolateValido(25).ok).toBe(true);
    expect(pesoChocolateValido(30).ok).toBe(true);
    expect(pesoChocolateValido(48).ok).toBe(true);
  });

  it('lo que NO es un peso se rechaza con mensaje, no se corrige en silencio', () => {
    // Corregir convierte un error visible en un dato falso que nadie vuelve a revisar.
    const r = pesoChocolateValido('mucho');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('kg');
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
