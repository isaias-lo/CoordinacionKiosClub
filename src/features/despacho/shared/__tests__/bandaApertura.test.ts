import { describe, it, expect } from 'vitest';
import { rotuloDiaApertura, bandaDeApertura } from '../bandaApertura';

describe('rotuloDiaApertura', () => {
  it('EL CASO DE 62PLD: el viernes 30 de octubre', () => {
    expect(rotuloDiaApertura('2026-10-30')).toBe('VIE 30/10');
  });

  it('63CAL: el miércoles 28', () => {
    expect(rotuloDiaApertura('2026-10-28')).toBe('MIÉ 28/10');
  });

  it('los siete días de una semana', () => {
    // Del domingo 25 al sábado 31 de octubre de 2026.
    expect([25, 26, 27, 28, 29, 30, 31].map(d => rotuloDiaApertura(`2026-10-${d}`)))
      .toEqual(['DOM 25/10', 'LUN 26/10', 'MAR 27/10', 'MIÉ 28/10', 'JUE 29/10', 'VIE 30/10', 'SÁB 31/10']);
  });

  it('rellena con cero: un día de un dígito no desalinea la banda', () => {
    expect(rotuloDiaApertura('2026-11-05')).toBe('JUE 05/11');
    expect(rotuloDiaApertura('2026-01-01')).toBe('JUE 01/01');
  });

  it('un día que no se entiende NO imprime basura en un pallet', () => {
    // `2026-13-45` y `2026-02-30` tienen la FORMA correcta y no existen: `Date.UTC` las rueda
    // sin quejarse, e imprimían «DOM 45/13» en algo que se pega a un pallet.
    for (const malo of ['', '   ', 'basura', '30/10/2026', '2026-13-45', '2026-02-30', null, undefined]) {
      expect(rotuloDiaApertura(malo)).toBe('');
    }
  });

  it('el nombre del día NO depende del idioma del equipo que imprime', () => {
    // Sale de una lista fija: un equipo con el idioma en inglés habría impreso «FRI».
    expect(rotuloDiaApertura('2026-10-30').startsWith('VIE')).toBe(true);
  });
});

describe('bandaDeApertura', () => {
  it('sin día, NO hay banda: la etiqueta es normal', () => {
    expect(bandaDeApertura(null)).toBeNull();
    expect(bandaDeApertura(undefined)).toBeNull();
    expect(bandaDeApertura('')).toBeNull();
    expect(bandaDeApertura('   ')).toBeNull();
  });

  it('con día, la banda completa', () => {
    expect(bandaDeApertura('2026-10-30')).toEqual({
      titulo: 'APERTURA', rotulo: 'Movimientos de', dia: 'VIE 30/10',
    });
  });

  it('con un día ilegible hay banda, pero sin fecha inventada', () => {
    // Que sea apertura es cierto igual; lo que no se sabe es de cuándo. Se dice lo que se sabe.
    expect(bandaDeApertura('basura')).toEqual({ titulo: 'APERTURA', rotulo: '', dia: '' });
  });
});
