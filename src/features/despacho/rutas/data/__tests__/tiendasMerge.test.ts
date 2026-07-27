import { describe, it, expect } from 'vitest';
import { mergeTiendas, isValidChileGps, type DbTiendaRow } from '../tiendasMerge';
import type { TiendaInfo } from '../tiendas';

const STATIC: Record<string, TiendaInfo> = {
  '02SCL': { n: 'San Carlos', z: 'Corredor Oriente', v: '09:00-12:00', d: 'Av. Plaza 1250', correos: 'sc@kc.com' },
};

describe('isValidChileGps', () => {
  it('acepta coords dentro de Chile', () => {
    expect(isValidChileGps(-33.4, -70.6)).toBe(true);
  });
  it('rechaza null/NaN/fuera de rango', () => {
    expect(isValidChileGps(null, -70.6)).toBe(false);
    expect(isValidChileGps(-33.4, null)).toBe(false);
    expect(isValidChileGps(NaN, -70.6)).toBe(false);
    expect(isValidChileGps(10, -70.6)).toBe(false);   // lat fuera
    expect(isValidChileGps(-33.4, -10)).toBe(false);  // lon fuera
  });
});

describe('mergeTiendas', () => {
  it('agrega una tienda que solo existe en la BD', () => {
    const rows: DbTiendaRow[] = [{ codigo: '26ALC', nombre: 'Alto las Condes', sector_comuna: 'Las Condes', ventana: '', direccion: 'Kennedy 9001', activo: true }];
    const m = mergeTiendas(STATIC, rows);
    expect(m['26ALC'].n).toBe('Alto las Condes');
    expect(m['26ALC'].d).toBe('Kennedy 9001');
    expect(m['02SCL']).toBeDefined(); // el estático se conserva
  });

  it('la BD manda pero NO pisa con vacío (conserva el estático)', () => {
    const rows: DbTiendaRow[] = [{ codigo: '02SCL', nombre: 'San Carlos de Apoquindo', direccion: '', activo: true }];
    const m = mergeTiendas(STATIC, rows);
    expect(m['02SCL'].n).toBe('San Carlos de Apoquindo'); // nombre nuevo de la BD
    expect(m['02SCL'].d).toBe('Av. Plaza 1250');          // dirección vacía en BD → se conserva la estática
    expect(m['02SCL'].correos).toBe('sc@kc.com');         // correos no venía en BD → se conserva
  });

  it('omite inactivas', () => {
    const rows: DbTiendaRow[] = [{ codigo: '99XXX', nombre: 'Cerrada', activo: false }];
    const m = mergeTiendas(STATIC, rows);
    expect(m['99XXX']).toBeUndefined();
  });

  it('normaliza el código de la BD (mayúsculas, conserva Ñ)', () => {
    const rows: DbTiendaRow[] = [{ codigo: '23peñ', nombre: 'Peñalolén', activo: true }];
    const m = mergeTiendas({}, rows);
    expect(m['23PEÑ'].n).toBe('Peñalolén');
  });

  it('tolera dbRows vacío/undefined', () => {
    expect(mergeTiendas(STATIC, [])).toEqual(STATIC);
    // @ts-expect-error probar robustez ante undefined
    expect(mergeTiendas(STATIC, undefined)).toEqual(STATIC);
  });
});
