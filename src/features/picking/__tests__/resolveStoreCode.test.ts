import { describe, it, expect } from 'vitest';
import { extractStoreCode, resolveStoreCode, canonicalStoreCode } from '../picking-utils';

describe('extractStoreCode', () => {
  it('extrae el código de un texto simple', () => {
    expect(extractStoreCode('42ANP')).toBe('42ANP');
  });

  it('extrae el código de una ruta de ubicación (columna A)', () => {
    expect(extractStoreCode('WH/PICK/42ANP/Stock')).toBe('42ANP');
    expect(extractStoreCode('Tienda 42ANP')).toBe('42ANP');
  });

  it('normaliza a mayúsculas', () => {
    expect(extractStoreCode('42anp')).toBe('42ANP');
  });

  it('devuelve "" si no hay código', () => {
    expect(extractStoreCode('')).toBe('');
    expect(extractStoreCode('Picking')).toBe('');
  });

  it('extrae códigos con Ñ sin truncar (bug 23PEÑ → no debe quedar en 23PE)', () => {
    expect(extractStoreCode('23PEÑ')).toBe('23PEÑ');
    expect(extractStoreCode('WH/PICK/23PEÑ/Stock')).toBe('23PEÑ');
    expect(extractStoreCode('Abastecimiento Comida 23PEÑ Fecha(16/06/2026)')).toBe('23PEÑ');
    expect(extractStoreCode('23peñ')).toBe('23PEÑ');
  });

  it('extrae códigos con dígito final sin truncar (bug 35BN2/38SP2 → sin semáforo)', () => {
    expect(extractStoreCode('35BN2')).toBe('35BN2');
    expect(extractStoreCode('38SP2')).toBe('38SP2');
    expect(extractStoreCode('WH/PICK/35BN2/Stock')).toBe('35BN2');
    expect(extractStoreCode('Abastecimiento Hogar 38SP2 Fecha(19/06/2026)')).toBe('38SP2');
    expect(extractStoreCode('35bn2')).toBe('35BN2');
    // sigue funcionando el código sin dígito final
    expect(extractStoreCode('42ANP')).toBe('42ANP');
  });
});

describe('resolveStoreCode', () => {
  it('caso del bug: typo en origin (52ANP) pero destino correcto (42ANP) → gana el destino', () => {
    expect(resolveStoreCode({
      toLocation: 'WH/PICK/42ANP/Stock',
      origin: 'Abastecimiento Hogar 52ANP',
    })).toBe('42ANP');
  });

  it('respaldo al origin cuando el destino no trae código', () => {
    expect(resolveStoreCode({
      toLocation: 'Picking',
      origin: 'Abastecimiento Hogar 28TEM',
    })).toBe('28TEM');
  });

  it('último recurso: partner', () => {
    expect(resolveStoreCode({
      toLocation: '',
      origin: 'Abastecimiento sin código',
      partner: 'Cliente 39PSB',
    })).toBe('39PSB');
  });

  it('sin ningún código → ""', () => {
    expect(resolveStoreCode({ toLocation: 'Picking', origin: 'Abastecimiento' })).toBe('');
  });

  it('Viña (37VIÑ en Odoo) se canoniza al código del catálogo 37VIN → semáforo hace match', () => {
    expect(resolveStoreCode({ toLocation: 'WH/PICK/37VIÑ/Stock' })).toBe('37VIN');
    expect(resolveStoreCode({ toLocation: 'Picking', origin: 'Abastecimiento Comida 37VIÑ Fecha(23/06/2026)' })).toBe('37VIN');
    // por nombre también
    expect(resolveStoreCode({ toLocation: 'Picking', origin: 'Abastecimiento Viña del Mar' })).toBe('37VIN');
  });
});

describe('canonicalStoreCode', () => {
  it('colapsa variantes de Ñ al código del catálogo', () => {
    expect(canonicalStoreCode('37VIÑ')).toBe('37VIN'); // Odoo con Ñ → catálogo con N
    expect(canonicalStoreCode('37VIN')).toBe('37VIN');
    expect(canonicalStoreCode('23PEÑ')).toBe('23PEÑ'); // catálogo conserva la Ñ
    expect(canonicalStoreCode('23PEN')).toBe('23PEÑ'); // variante con N → canónico con Ñ
  });

  it('código desconocido o vacío se devuelve igual', () => {
    expect(canonicalStoreCode('NOEXISTE')).toBe('NOEXISTE');
    expect(canonicalStoreCode('')).toBe('');
  });
});
