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
  // corredorFn inyectable → tests deterministas (no dependen del catálogo real).
  const corredorMock = (t: { comuna?: string | null }) => (t.comuna === 'Las Condes' ? 'Corredor Oriente' : null);

  it('agrega una tienda que solo existe en la BD', () => {
    const rows: DbTiendaRow[] = [{ codigo: '26ALC', nombre: 'Alto las Condes', sector_comuna: 'Las Condes', ventana: '', direccion: 'Kennedy 9001', activo: true }];
    const m = mergeTiendas(STATIC, rows, corredorMock);
    expect(m['26ALC'].n).toBe('Alto las Condes');
    expect(m['26ALC'].d).toBe('Kennedy 9001');
    expect(m['02SCL']).toBeDefined(); // el estático se conserva
  });

  it('la zona es el CORREDOR (auto-asignado), NO la comuna (fix 26ALC)', () => {
    const rows: DbTiendaRow[] = [{ codigo: '26ALC', nombre: 'Alto las Condes', sector_comuna: 'Las Condes', direccion: 'Kennedy 9001', activo: true }];
    const m = mergeTiendas({}, rows, corredorMock);
    expect(m['26ALC'].z).toBe('Corredor Oriente'); // antes daba 'Las Condes'
  });

  it('el corredor del catálogo estático NO se pisa con la comuna de la BD', () => {
    const rows: DbTiendaRow[] = [{ codigo: '02SCL', sector_comuna: 'La Reina', activo: true }];
    const m = mergeTiendas(STATIC, rows, corredorMock);
    expect(m['02SCL'].z).toBe('Corredor Oriente'); // el z estático se conserva (no lo pisa 'La Reina')
  });

  it('corredor EXPLÍCITO de la BD gana sobre todo', () => {
    const rows: DbTiendaRow[] = [{ codigo: '02SCL', corredor: 'Corredor Sur', sector_comuna: 'La Reina', activo: true }];
    const m = mergeTiendas(STATIC, rows, corredorMock);
    expect(m['02SCL'].z).toBe('Corredor Sur');
  });

  it('usa la comuna como ÚLTIMO recurso si no hay corredor', () => {
    const rows: DbTiendaRow[] = [{ codigo: '77XXX', sector_comuna: 'Comuna Rara', activo: true }];
    const m = mergeTiendas({}, rows, corredorMock); // mock devuelve null para comuna != Las Condes
    expect(m['77XXX'].z).toBe('Comuna Rara');
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
