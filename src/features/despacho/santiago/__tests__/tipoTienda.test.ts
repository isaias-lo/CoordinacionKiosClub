import { describe, it, expect } from 'vitest';
import { tipoBadge } from '../tipoTienda';

describe('tipoBadge', () => {
  it('mapea los tipos del catálogo a etiqueta', () => {
    expect(tipoBadge('MALL')?.label).toBe('Mall');
    expect(tipoBadge('STRIPCENTER')?.label).toBe('Strip');
    expect(tipoBadge('TIENDA')?.label).toBe('Tienda');
  });

  it('normaliza mayúsculas/espacios', () => {
    expect(tipoBadge('mall')?.label).toBe('Mall');
    expect(tipoBadge('  StripCenter  ')?.label).toBe('Strip');
  });

  it('oficina, vacío o desconocido → null (sin badge)', () => {
    expect(tipoBadge('oficina')).toBeNull();
    expect(tipoBadge('')).toBeNull();
    expect(tipoBadge(null)).toBeNull();
    expect(tipoBadge(undefined)).toBeNull();
    expect(tipoBadge('otra-cosa')).toBeNull();
  });

  it('cada badge trae colores', () => {
    const b = tipoBadge('MALL');
    expect(b?.bg).toBeTruthy();
    expect(b?.color).toBeTruthy();
  });
});
