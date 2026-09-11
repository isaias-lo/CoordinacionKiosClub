import { describe, it, expect } from 'vitest';
import { repartirPeso, pesoTotalValido, leerPesoTotal, serializarPesoTotal, avisoCantidad } from '../pesoTotal';

describe('repartirPeso — el total se reparte entre las cajas', () => {
  it('reparte en partes iguales cuando da justo', () => {
    expect(repartirPeso(180, 10)).toEqual(Array(10).fill(18));
  });

  it('la suma da EXACTO el total: la última caja absorbe el redondeo', () => {
    const r = repartirPeso(100, 3);
    expect(r).toEqual([33.3, 33.3, 33.4]);
    expect(Math.round(r.reduce((a, b) => a + b, 0) * 10) / 10).toBe(100);
  });

  it('la suma cuadra también con totales con decimales', () => {
    const r = repartirPeso(47.5, 6);
    expect(Math.round(r.reduce((a, b) => a + b, 0) * 10) / 10).toBe(47.5);
    r.forEach(x => expect(Number.isInteger(Math.round(x * 10))).toBe(true)); // a 0,1 kg
  });

  it('una sola caja se lleva todo', () => {
    expect(repartirPeso(18.5, 1)).toEqual([18.5]);
  });

  it('sin cajas o sin peso no hay nada que repartir', () => {
    expect(repartirPeso(100, 0)).toEqual([]);
    expect(repartirPeso(0, 5)).toEqual([]);
    expect(repartirPeso(-3, 5)).toEqual([]);
  });

  it('ninguna caja queda en cero o negativa', () => {
    repartirPeso(0.5, 5).forEach(x => expect(x).toBeGreaterThan(0));
  });
});

describe('pesoTotalValido', () => {
  it('acepta coma decimal — es lo que escribe un teclado en español', () => {
    expect(pesoTotalValido('180,5', 10, 'CH')).toEqual({ ok: true, total: 180.5, porCaja: 18.05 });
  });

  it('sin cajas de ese tipo todavía, no se puede repartir', () => {
    const r = pesoTotalValido('100', 0, 'CC');
    expect(r.ok).toBe(false);
  });

  it('rechaza cero, vacío y basura', () => {
    expect(pesoTotalValido('', 5, 'CH').ok).toBe(false);
    expect(pesoTotalValido('0', 5, 'CH').ok).toBe(false);
    expect(pesoTotalValido('abc', 5, 'CH').ok).toBe(false);
  });

  it('un chocolate no puede promediar más de 25 kg: probablemente falta contar cajas', () => {
    const r = pesoTotalValido('300', 10, 'CH');   // 30 kg c/u
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/30 kg por caja/);
  });

  it('las cajas de congelado tienen su propio tope de cordura, no el del chocolate', () => {
    expect(pesoTotalValido('300', 10, 'CC').ok).toBe(true);    // 30 kg c/u: posible
    expect(pesoTotalValido('3000', 10, 'CN').ok).toBe(false);  // 300 kg c/u: no
  });
});

describe('guardar y leer el total', () => {
  it('ida y vuelta', () => {
    expect(leerPesoTotal(serializarPesoTotal({ total: 180, n: 10 }))).toEqual({ total: 180, n: 10 });
  });

  it('un valor roto o vacío no rompe la tarjeta: se lee como "sin total"', () => {
    expect(leerPesoTotal('')).toBeNull();
    expect(leerPesoTotal('{roto')).toBeNull();
    expect(leerPesoTotal('{"total":"x","n":2}')).toBeNull();
    expect(leerPesoTotal(null)).toBeNull();
  });
});

describe('avisoCantidad — si cambió la cantidad después de pesar', () => {
  it('mismas cajas: nada que avisar', () => {
    expect(avisoCantidad({ total: 180, n: 10 }, 10)).toBeNull();
  });

  it('se agregó una caja: pide volver a pesar, no reparte a ciegas', () => {
    // Repartir los mismos 180 kg entre 11 cajas sería inventar: el peso de la caja nueva no se sabe.
    const m = avisoCantidad({ total: 180, n: 10 }, 11);
    expect(m).toMatch(/10 cajas/);
    expect(m).toMatch(/11/);
    expect(m).toMatch(/vuelve a pesar/i);
  });

  it('sin total guardado, nada que avisar', () => {
    expect(avisoCantidad(null, 4)).toBeNull();
  });
});
