import { describe, it, expect } from 'vitest';
import { guiaHref } from '../guiaUrl';

describe('guiaHref', () => {
  it('usa la URL completa de Supabase Storage tal cual', () => {
    const url = 'https://aiclobncdhxjxdlvkezk.supabase.co/storage/v1/object/public/guides/1785_12LAS_ORIGINAL.pdf';
    expect(guiaHref(url)).toBe(url);
  });

  it('deja pasar una URL http(s) cualquiera (incl. Drive completa)', () => {
    expect(guiaHref('https://drive.google.com/file/d/ABC123/view')).toBe('https://drive.google.com/file/d/ABC123/view');
    expect(guiaHref('http://x.test/a.pdf')).toBe('http://x.test/a.pdf');
  });

  it('envuelve un fileId pelado (legado) como URL de Drive', () => {
    expect(guiaHref('1A2b3C')).toBe('https://drive.google.com/file/d/1A2b3C/view');
  });

  it('devuelve vacío para null/undefined/espacios', () => {
    expect(guiaHref(null)).toBe('');
    expect(guiaHref(undefined)).toBe('');
    expect(guiaHref('   ')).toBe('');
  });
});
