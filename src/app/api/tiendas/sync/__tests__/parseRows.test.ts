import { describe, it, expect } from 'vitest';
import { parseDecimal, looksLikeHeader, rowToTienda } from '../parseRows';

describe('parseDecimal', () => {
  it('acepta punto y coma decimal', () => {
    expect(parseDecimal('-33.4')).toBe(-33.4);
    expect(parseDecimal('-33,4')).toBe(-33.4);
  });
  it('vacío/inválido → null', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
  });
});

describe('looksLikeHeader', () => {
  it('detecta títulos/encabezados', () => {
    expect(looksLikeHeader('')).toBe(true);
    expect(looksLikeHeader('⚡ CATÁLOGO DE TIENDAS')).toBe(true);
    expect(looksLikeHeader('CÓDIGO')).toBe(true);
    expect(looksLikeHeader('Nombre de la tienda larga')).toBe(true); // >15
  });
  it('un código real corto NO es header', () => {
    expect(looksLikeHeader('LAS1')).toBe(false);
    expect(looksLikeHeader('26ALC')).toBe(false);
    expect(looksLikeHeader('23PEÑ')).toBe(false);
  });
});

describe('rowToTienda', () => {
  const full = [
    '26alc', 'Alto las Condes', 'Kennedy 9001', 'RM', 'Las Condes', 'Corredor Oriente',
    'Mall', '08:00-15:00', 'Diaria', '3', '-33,388', '-70,545',
    'x@kc.com', '569111', 'Sup', '569222', 'Transp', 'NO',
  ];

  it('mapea la fila completa y normaliza el código', () => {
    const t = rowToTienda(full);
    expect(t.codigo).toBe('26ALC');       // normalizeCod → upper
    expect(t.nombre).toBe('Alto las Condes');
    expect(t.lat).toBe(-33.388);          // coma decimal
    expect(t.lon).toBe(-70.545);
    expect(t.activo).toBe(false);         // 'NO' → inactivo (bug ACTIVO cubierto)
  });

  it('fila corta → strings vacíos y lat/lon null (no undefined)', () => {
    const t = rowToTienda(['LAS1', 'Las Condes']);
    expect(t.direccion).toBe('');
    expect(t.lat).toBeNull();
    expect(t.lon).toBeNull();
    expect(t.activo).toBe(true);          // ausente → activo por defecto
  });
});
