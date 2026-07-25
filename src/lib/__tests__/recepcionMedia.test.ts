import { describe, it, expect } from 'vitest';
import { parseDataUrl, acuseLabel, parseRecepcionId, RECEP_MAX_FOTOS } from '../recepcionMedia';

describe('parseDataUrl', () => {
  it('parsea un PNG base64', () => {
    const out = parseDataUrl('data:image/png;base64,AAAA');
    expect(out).toEqual({ base64: 'AAAA', contentType: 'image/png', ext: 'png' });
  });

  it('normaliza jpeg → jpg', () => {
    const out = parseDataUrl('data:image/jpeg;base64,QUJD');
    expect(out).toEqual({ base64: 'QUJD', contentType: 'image/jpeg', ext: 'jpg' });
  });

  it('acepta jpg y webp', () => {
    expect(parseDataUrl('data:image/jpg;base64,QQ==')?.ext).toBe('jpg');
    expect(parseDataUrl('data:image/webp;base64,QQ==')?.ext).toBe('webp');
  });

  it('quita espacios/saltos de línea del payload', () => {
    const out = parseDataUrl('data:image/png;base64,AA AA\nBB');
    expect(out?.base64).toBe('AAAABB');
  });

  it('rechaza data URLs no-imagen o mal formados', () => {
    expect(parseDataUrl('data:application/pdf;base64,AAAA')).toBeNull();
    expect(parseDataUrl('data:image/gif;base64,AAAA')).toBeNull(); // gif no soportado
    expect(parseDataUrl('https://example.com/x.png')).toBeNull();
    expect(parseDataUrl('data:image/png;base64,')).toBeNull();     // vacío
    expect(parseDataUrl('')).toBeNull();
  });

  it('rechaza valores no-string', () => {
    expect(parseDataUrl(null)).toBeNull();
    expect(parseDataUrl(undefined)).toBeNull();
    expect(parseDataUrl(123)).toBeNull();
  });
});

describe('acuseLabel', () => {
  it('conforme', () => expect(acuseLabel(true)).toBe('Recibí conforme'));
  it('con observaciones', () => expect(acuseLabel(false)).toBe('Recibí con observaciones'));
});

describe('parseRecepcionId', () => {
  it('acepta enteros positivos', () => {
    expect(parseRecepcionId('4')).toBe(4);
    expect(parseRecepcionId('  128 ')).toBe(128);
    expect(parseRecepcionId(9)).toBe(9);
  });

  it('rechaza no-enteros, cero, negativos y basura', () => {
    expect(parseRecepcionId('0')).toBeNull();
    expect(parseRecepcionId('-3')).toBeNull();
    expect(parseRecepcionId('1.5')).toBeNull();
    expect(parseRecepcionId('4abc')).toBeNull();
    expect(parseRecepcionId('abc')).toBeNull();
    expect(parseRecepcionId('')).toBeNull();
    expect(parseRecepcionId(null)).toBeNull();
  });
});

describe('RECEP_MAX_FOTOS', () => {
  it('es un tope razonable', () => {
    expect(RECEP_MAX_FOTOS).toBeGreaterThan(0);
    expect(RECEP_MAX_FOTOS).toBeLessThanOrEqual(20);
  });
});
