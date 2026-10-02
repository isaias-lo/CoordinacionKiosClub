import { describe, it, expect } from 'vitest';
import { codsRegionesDeBD, registrarCodsRegiones, isRegionesCod, CODS_CURADOS, registrarTiendasBD, TIENDAS, type TiendaBDRow } from '../tiendas';

const fila = (p: Partial<TiendaBDRow>): TiendaBDRow => ({ codigo: 'XX', nombre: 'X', ...p } as TiendaBDRow);

describe('codsRegionesDeBD', () => {
  it('toma las de sector Región, en cualquiera de sus escrituras', () => {
    const cods = codsRegionesDeBD([
      fila({ codigo: '60PBL', nombre: 'Los Pablos', sector_comuna: 'Región Sur' }),
      fila({ codigo: '36CHL', nombre: 'Chillán',    sector_comuna: 'region norte' }),
      fila({ codigo: '31TLC', nombre: 'Talca',      sector_comuna: 'Región' }),
    ]);
    expect(cods).toEqual(['60PBL', '36CHL', '31TLC']);
  });

  it('deja fuera a las de Santiago y Costa', () => {
    expect(codsRegionesDeBD([
      fila({ codigo: '12LAS', nombre: 'Las Condes', sector_comuna: 'Oriente' }),
      fila({ codigo: '08RNC', nombre: 'Reñaca',     sector_comuna: 'Costa' }),
    ])).toEqual([]);
  });

  it('deja fuera a las inactivas y a las sin código', () => {
    expect(codsRegionesDeBD([
      fila({ codigo: '99XXX', nombre: 'Baja', sector_comuna: 'Región Sur', activo: false }),
      fila({ codigo: '',      nombre: 'Sin código', sector_comuna: 'Región Sur' }),
    ])).toEqual([]);
  });

  it('NO exige nombre: para clasificar no hace falta poder armar la entrada del catálogo', () => {
    expect(codsRegionesDeBD([fila({ codigo: '60PBL', nombre: '', sector_comuna: 'Región Sur' })]))
      .toEqual(['60PBL']);
  });

  it('normaliza y no repite', () => {
    expect(codsRegionesDeBD([
      fila({ codigo: ' 60pbl ', nombre: 'a', sector_comuna: 'Región Sur' }),
      fila({ codigo: '60PBL',   nombre: 'b', sector_comuna: 'Región Sur' }),
    ])).toEqual(['60PBL']);
  });

  it('aguanta null y undefined', () => {
    expect(codsRegionesDeBD(null)).toEqual([]);
    expect(codsRegionesDeBD(undefined)).toEqual([]);
  });

  it('es pura: no clasifica por sí sola', () => {
    codsRegionesDeBD([fila({ codigo: '77AAA', nombre: 'Nueva', sector_comuna: 'Región Sur' })]);
    expect(isRegionesCod('77AAA')).toBe(false);
  });
});

describe('registrarCodsRegiones', () => {
  it('hace que isRegionesCod reconozca una tienda de Config', () => {
    expect(isRegionesCod('78BBB')).toBe(false);
    expect(registrarCodsRegiones(['78BBB'])).toEqual(['78BBB']);
    expect(isRegionesCod('78BBB')).toBe(true);
  });

  it('es idempotente: la segunda vez no devuelve nada', () => {
    registrarCodsRegiones(['79CCC']);
    expect(registrarCodsRegiones(['79CCC'])).toEqual([]);
  });

  it('no toca el catálogo curado — es lo que protege a Nacional de perder sus entradas', () => {
    const antes = CODS_CURADOS.size;
    registrarCodsRegiones(['80DDD']);
    expect(CODS_CURADOS.size).toBe(antes);
    expect(CODS_CURADOS.has('80DDD')).toBe(false);
  });

  it('las curadas siguen siendo de Regiones', () => {
    expect(isRegionesCod('47PTV')).toBe(true);
  });
});

// ── LA REGRESIÓN QUE EL ARREGLO PODÍA CAUSAR ───────────────────────────────────────────────────
//
// `registrarTiendasBD` se saltaba una fila con `if (REGIONES_CODS.has(cod)) continue`. Desde que
// RM/Costa también clasifica, ese Set ya tiene el código ANTES de que Nacional construya su
// entrada de catálogo — así que preguntar por él dejaba a Nacional sin la tienda. Abrir RM/Costa
// antes de Nacional borraba 60PBL de la lista de Nacional.
//
// Por eso la pregunta es por `CODS_CURADOS`, que no crece. Esto lo fija.
describe('el orden de las pestañas no puede dejar a Nacional sin su catálogo', () => {
  const fila = (codigo: string, nombre: string) => ({
    codigo, nombre, sector_comuna: 'Región Sur', region: 'Los Lagos', activo: true,
  } as TiendaBDRow);

  it('RM/Costa clasifica primero y Nacional DESPUÉS igual construye la entrada', () => {
    // 1 · RM/Costa trae el catálogo y solo clasifica.
    registrarCodsRegiones(codsRegionesDeBD([fila('81EEE', 'Tienda Nueva Sur')]));
    expect(isRegionesCod('81EEE')).toBe(true);
    expect(TIENDAS['Tienda Nueva Sur']).toBeUndefined();   // todavía no está en el catálogo

    // 2 · Nacional abre después y tiene que poder armarla igual.
    const { agregadas } = registrarTiendasBD([fila('81EEE', 'Tienda Nueva Sur')]);
    expect(TIENDAS['Tienda Nueva Sur']?.cod).toBe('81EEE');
    expect(agregadas).toContain('81EEE');
  });

  it('y una curada a mano sigue sin pisarse', () => {
    const original = TIENDAS['Castro'];
    registrarCodsRegiones(['57CAS']);
    registrarTiendasBD([{ ...fila('57CAS', 'Castro'), region: 'OTRA' } as TiendaBDRow]);
    expect(TIENDAS['Castro']).toBe(original);
    expect(CODS_CURADOS.has('57CAS')).toBe(true);
  });
});
