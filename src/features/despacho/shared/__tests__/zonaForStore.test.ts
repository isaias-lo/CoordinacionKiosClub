import { describe, it, expect } from 'vitest';
import { zonaForStore } from '../tiendasAdelanto';
import type { TiendaInfo } from '@/features/despacho/rutas/data/tiendas';

const t = (extra: Partial<TiendaInfo>): TiendaInfo => ({ n: 'X', z: '', v: '', ...extra });

describe('zonaForStore', () => {
  // Las cinco de la V Región. `z` es lo único que traen las fichas estáticas.
  it('sector Costa → costa', () => {
    expect(zonaForStore('37VIÑ', t({ z: 'Costa', region: 'Valparaíso' }))).toBe('costa');
  });

  it('sector de Regiones → fal', () => {
    expect(zonaForStore('57CAS', t({ sector: 'Región', z: 'Región', region: 'Los Lagos' }))).toBe('fal');
    expect(zonaForStore('60PBL', t({ sector: 'Región Sur', z: 'Región Sur' }))).toBe('fal');
  });

  it('un corredor de Santiago → rm', () => {
    expect(zonaForStore('22LGN', t({ sector: 'Corredor Norte', z: 'Corredor Norte', region: 'RM' }))).toBe('rm');
  });

  // `sector` solo lo trae la BD; las fichas estáticas lo tienen en `z`.
  it('cae a `z` cuando no hay `sector`', () => {
    expect(zonaForStore('X', t({ z: 'Costa' }))).toBe('costa');
  });

  it('`sector` manda por sobre `z`', () => {
    expect(zonaForStore('X', t({ sector: 'Costa', z: 'Corredor Norte' }))).toBe('costa');
  });

  // El caso 59EGN: activa y sin sector. El default sigue siendo 'rm', igual que antes del cambio.
  it('sin sector cae a rm, como antes', () => {
    expect(zonaForStore('59EGN', t({ sector: '', z: '', region: 'RM' }))).toBe('rm');
  });

  it('una tienda desconocida cae a rm', () => {
    expect(zonaForStore('NOEXISTE')).toBe('rm');
  });

  // El punto del cambio: la región dejó de decidir. Renombrarla —por ejemplo al nombre largo que
  // devuelve Google— ya no cambia a qué bodega va la tienda.
  it('el nombre de la región ya no decide la bodega', () => {
    const sector = { sector: 'Corredor Oriente', z: 'Corredor Oriente' };
    expect(zonaForStore('X', t({ ...sector, region: 'RM' }))).toBe('rm');
    expect(zonaForStore('X', t({ ...sector, region: 'Región Metropolitana de Santiago' }))).toBe('rm');
    expect(zonaForStore('X', t({ ...sector, region: '' }))).toBe('rm');
  });
});
