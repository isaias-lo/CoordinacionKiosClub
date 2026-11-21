import { describe, it, expect } from 'vitest';
import {
  bytesDeBase64, leerFotoDataUrl, leerFotos, rutaFoto, MAX_BYTES_FOTO, MAX_BYTES_FOTOS_TOTAL,
} from '../fotos';

/** Un data URL cuyo contenido decodificado ocupa `bytes` bytes. */
function dataUrl(bytes: number, mime = 'image/jpeg'): string {
  return `data:${mime};base64,${Buffer.alloc(bytes, 7).toString('base64')}`;
}

describe('bytesDeBase64', () => {
  it('calcula lo que ocupa decodificado, con y sin relleno', () => {
    for (const n of [1, 2, 3, 4, 5, 1000]) {
      expect(bytesDeBase64(Buffer.alloc(n).toString('base64'))).toBe(n);
    }
  });

  it('vacío es cero', () => {
    expect(bytesDeBase64('')).toBe(0);
  });
});

describe('leerFotoDataUrl', () => {
  it('acepta un JPEG y devuelve su tipo, extensión y tamaño', () => {
    const r = leerFotoDataUrl(dataUrl(1234));
    expect(r).toMatchObject({ ok: true, mime: 'image/jpeg', extension: 'jpg', bytes: 1234 });
  });

  it('acepta PNG y WebP', () => {
    expect(leerFotoDataUrl(dataUrl(10, 'image/png'))).toMatchObject({ ok: true, extension: 'png' });
    expect(leerFotoDataUrl(dataUrl(10, 'image/webp'))).toMatchObject({ ok: true, extension: 'webp' });
  });

  it('rechaza lo que no es imagen', () => {
    expect(leerFotoDataUrl(dataUrl(10, 'application/pdf')).ok).toBe(false);
    expect(leerFotoDataUrl('fotos/a.jpg').ok).toBe(false);
    expect(leerFotoDataUrl(undefined).ok).toBe(false);
    expect(leerFotoDataUrl({}).ok).toBe(false);
  });

  it('rechaza una foto vacía', () => {
    expect(leerFotoDataUrl('data:image/jpeg;base64,').ok).toBe(false);
  });

  it('en el tope exacto pasa; un byte más, no', () => {
    expect(leerFotoDataUrl(dataUrl(MAX_BYTES_FOTO)).ok).toBe(true);
    expect(leerFotoDataUrl(dataUrl(MAX_BYTES_FOTO + 1)).ok).toBe(false);
  });
});

describe('leerFotos', () => {
  it('cinco fotos normales pasan', () => {
    const r = leerFotos(Array.from({ length: 5 }, () => dataUrl(300_000)));
    expect(r.ok).toBe(true);
  });

  it('cada foto bajo su tope pero la suma sobre el total: no pasa (Vercel corta a 4,5 MB)', () => {
    const cada = MAX_BYTES_FOTO; // 900 KB
    const n = Math.ceil((MAX_BYTES_FOTOS_TOTAL + 1) / cada);
    const r = leerFotos(Array.from({ length: n }, () => dataUrl(cada)));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.join(' ')).toMatch(/juntas/);
  });

  it('el total en base64 queda bajo los 4,5 MB de Vercel', () => {
    expect(Math.ceil(MAX_BYTES_FOTOS_TOTAL * 4 / 3)).toBeLessThan(4_500_000 - 100_000);
  });

  it('junta los errores sin repetirlos', () => {
    const r = leerFotos(['x', 'y', dataUrl(10)]);
    expect(r).toEqual({ ok: false, errores: ['La foto no es una imagen válida'] });
  });
});

describe('rutaFoto', () => {
  const base = { fecha: '2026-11-21', codigoTienda: '26ALC', solicitudId: 'abc-123', nombre: 'f1', extension: 'jpg' };

  it('arma AAAA/MM/tienda/solicitud/nombre.ext', () => {
    expect(rutaFoto(base)).toBe('2026/11/26ALC/abc-123/f1.jpg');
  });

  it('limpia la Ñ y los acentos del código: Storage los rechaza (23PEÑ)', () => {
    expect(rutaFoto({ ...base, codigoTienda: '23peñ' })).toBe('2026/11/23PEN/abc-123/f1.jpg');
  });

  it('nada del código puede abrir una carpeta nueva', () => {
    expect(rutaFoto({ ...base, codigoTienda: '../x' })).toBe('2026/11/___X/abc-123/f1.jpg');
    expect(rutaFoto({ ...base, solicitudId: '..' })).toBe('2026/11/26ALC/__/f1.jpg');
  });

  it('una fecha inválida falla fuerte en vez de guardar en una carpeta rara', () => {
    expect(() => rutaFoto({ ...base, fecha: '' })).toThrow(/fecha/);
    expect(() => rutaFoto({ ...base, fecha: '21-11-2026' })).toThrow(/fecha/);
  });

  it('sin tienda falla fuerte', () => {
    expect(() => rutaFoto({ ...base, codigoTienda: '  ' })).toThrow(/tienda/);
  });
});
