import { describe, it, expect } from 'vitest';
import { linkNavegacion, linkLlamar } from '../contacto';

describe('linkNavegacion', () => {
  it('prefiere lat/lon reales sobre la dirección en texto', () => {
    expect(linkNavegacion({ lat: -33.45, lon: -70.66, direccion: 'Av. Siempre Viva 123', comuna: 'Providencia' }))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=-33.45,-70.66');
  });

  it('cae a la dirección en texto si no hay lat/lon', () => {
    expect(linkNavegacion({ direccion: 'Av. Siempre Viva 123', comuna: 'Providencia' }))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent('Av. Siempre Viva 123, Providencia'));
  });

  it('usa solo la dirección si no hay comuna', () => {
    expect(linkNavegacion({ direccion: 'Av. Siempre Viva 123' }))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent('Av. Siempre Viva 123'));
  });

  it('null si no hay lat/lon ni dirección', () => {
    expect(linkNavegacion({})).toBeNull();
    expect(linkNavegacion({ direccion: null, comuna: null })).toBeNull();
  });

  it('null (no 0,0) — lat/lon en 0 no son "sin dato", pero acá no hay caso real de tienda en el ecuador', () => {
    // Nota de diseño: 0 es un lat/lon válido en teoría; `!= null` los acepta, no `!lat`. Se
    // deja explícito para que un futuro cambio a `!a.lat` (que trataría 0 como "sin dato") se
    // note en este test antes de llegar a producción.
    expect(linkNavegacion({ lat: 0, lon: 0 })).toBe('https://www.google.com/maps/dir/?api=1&destination=0,0');
  });
});

describe('linkLlamar', () => {
  it('sanea espacios y mantiene el + inicial', () => {
    expect(linkLlamar('+56 9 8384 9612')).toBe('tel:+56983849612');
  });

  it('funciona sin +', () => {
    expect(linkLlamar('56962946532')).toBe('tel:56962946532');
  });

  it('null si está vacío o solo espacios', () => {
    expect(linkLlamar('')).toBeNull();
    expect(linkLlamar('   ')).toBeNull();
    expect(linkLlamar(null)).toBeNull();
    expect(linkLlamar(undefined)).toBeNull();
  });

  it('descarta un + que no está al inicio', () => {
    expect(linkLlamar('56 9+1234')).toBe('tel:5691234');
  });
});
