import { describe, it, expect } from 'vitest';
import { matchCodArchivo } from '../helpers';

// Códigos reales representativos, incluyendo el caso ambiguo San Pedro:
//   24SPP (San Pedro de la Paz) y 38SP2 (San Pedro de la Paz 2).
const CODS = ['24SPP', '38SP2', '53VAL', '33CON', '35BN2', '9PROV'];

describe('matchCodArchivo', () => {
  it('detecta el código completo incluyendo el dígito final (38SP2, no 38SP)', () => {
    expect(matchCodArchivo('38SP2-14-04-2026_163720_ORIGINAL.pdf', CODS)).toBe('38SP2');
  });

  it('no confunde 24SPP con 38SP2 (usa el número inicial)', () => {
    expect(matchCodArchivo('24SPP-14-04-2026.pdf', CODS)).toBe('24SPP');
  });

  it('detecta un código simple con separador', () => {
    expect(matchCodArchivo('53VAL-14-04-2026_163720_ORIGINAL.pdf', CODS)).toBe('53VAL');
  });

  it('elige el código conocido MÁS LARGO que sea prefijo (24SPP sobre un hipotético 24SP)', () => {
    expect(matchCodArchivo('24SPP_manifiesto.pdf', ['24SP', '24SPP'])).toBe('24SPP');
  });

  it('respeta el límite: no matchea 24SP dentro de 24SPP', () => {
    // Sólo existe 24SP; el nombre es 24SPP → el char siguiente ("P") es alfanumérico → sin match directo.
    expect(matchCodArchivo('24SPPxx.pdf', ['24SP'])).toBeNull();
  });

  it('funciona con nombre exactamente igual al código', () => {
    expect(matchCodArchivo('38SP2.pdf', CODS)).toBe('38SP2');
    expect(matchCodArchivo('38SP2', CODS)).toBe('38SP2');
  });

  it('es insensible a mayúsculas/minúsculas', () => {
    expect(matchCodArchivo('38sp2-guia.pdf', CODS)).toBe('38SP2');
  });

  it('usa el alias como fallback cuando el nombre trae otro código (38PSP → 38SP2)', () => {
    expect(matchCodArchivo('38PSP-14-04-2026.pdf', CODS, { '38PSP': '38SP2' })).toBe('38SP2');
  });

  it('usa el alias 35BNT → 35BN2', () => {
    expect(matchCodArchivo('35BNT_manifiesto.pdf', CODS, { '35BNT': '35BN2' })).toBe('35BN2');
  });

  it('devuelve null si no reconoce ningún código', () => {
    expect(matchCodArchivo('documento-sin-codigo.pdf', CODS)).toBeNull();
    expect(matchCodArchivo('99XYZ-guia.pdf', CODS)).toBeNull();
  });

  it('ignora un alias que no exista en la lista de códigos', () => {
    expect(matchCodArchivo('77ZZZ.pdf', CODS, { '77ZZZ': '77INEXISTENTE' })).toBeNull();
  });

  it('detecta código de un solo dígito inicial (9PROV)', () => {
    expect(matchCodArchivo('9PROV-14-04-2026.pdf', CODS)).toBe('9PROV');
  });
});
