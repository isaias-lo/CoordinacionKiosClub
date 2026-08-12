import { describe, it, expect } from 'vitest';
import { tipoTienda, grupoTienda } from '../tipoTienda';

describe('grupoTienda', () => {
  it('Costa / Región / RM según la zona', () => {
    expect(grupoTienda('Costa Valparaíso')).toBe('costa');
    expect(grupoTienda('Región')).toBe('fal');
    expect(grupoTienda('Providencia')).toBe('rm');
    expect(grupoTienda('')).toBe('rm');
    expect(grupoTienda(null)).toBe('rm');
  });
});

describe('tipoTienda', () => {
  it('reconoce Mall / Strip / Street desde el tipo de la BD', () => {
    expect(tipoTienda('Mall').key).toBe('mall');
    expect(tipoTienda('MALL PLAZA').key).toBe('mall');
    expect(tipoTienda('Strip Center').key).toBe('strip');
    expect(tipoTienda('stripcenter').key).toBe('strip');
    expect(tipoTienda('Street').key).toBe('street');
  });
  it('reconoce Costa / Región desde el tipo', () => {
    expect(tipoTienda('Costa').key).toBe('costa');
    expect(tipoTienda('Región').key).toBe('region');
    expect(tipoTienda('region').key).toBe('region');
  });
  it('tipo vacío → deriva de zona (Costa/Región)', () => {
    expect(tipoTienda('', '', 'Costa Valparaíso').key).toBe('costa');
    expect(tipoTienda(null, null, 'Región').key).toBe('region');
  });
  it('tipo vacío → deriva Mall si la dirección dice "local"', () => {
    expect(tipoTienda('', 'Local 123, Mall Plaza', '').key).toBe('mall');
  });
  it('tipo vacío y sin señales → Street (default)', () => {
    expect(tipoTienda('', 'Av. Siempre Viva 742', 'Providencia').key).toBe('street');
    expect(tipoTienda(undefined).key).toBe('street');
  });
  it('tipo desconocido → "otro" mostrando el texto tal cual', () => {
    const r = tipoTienda('Bodega Externa');
    expect(r.key).toBe('otro');
    expect(r.label).toBe('Bodega Externa');
  });
  it('cada tipo trae label + color', () => {
    const r = tipoTienda('Mall');
    expect(r.label).toBe('Mall');
    expect(r.color).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
