import { describe, it, expect } from 'vitest';
import { fechaISOLocal } from '../fechaLocal';

describe('fechaISOLocal', () => {
  it('formatea YYYY-MM-DD desde los componentes LOCALES', () => {
    expect(fechaISOLocal(new Date(2026, 7, 27, 14, 0))).toBe('2026-08-27'); // 27 de agosto, mediodía
  });

  it('rellena mes y día de un dígito con cero', () => {
    expect(fechaISOLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(fechaISOLocal(new Date(2026, 8, 9))).toBe('2026-09-09');
  });

  it('usa el día LOCAL a las 23:30 (el caso que rompía con UTC)', () => {
    // 27-ago 23:30 hora local. Con `toISOString().slice(0,10)` en un huso al oeste de UTC esto daría
    // '2026-08-28' (día siguiente) → el bug. fechaISOLocal debe dar SIEMPRE el día local: 27.
    const d = new Date(2026, 7, 27, 23, 30);
    expect(fechaISOLocal(d)).toBe('2026-08-27');
  });

  it('usa el día LOCAL a las 00:30 (borde de la madrugada)', () => {
    const d = new Date(2026, 7, 27, 0, 30);
    expect(fechaISOLocal(d)).toBe('2026-08-27');
  });

  it('sin argumento devuelve el día local de hoy (coincide con getFullYear/Month/Date)', () => {
    const now = new Date();
    const esperado = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(fechaISOLocal()).toBe(esperado);
  });
});
