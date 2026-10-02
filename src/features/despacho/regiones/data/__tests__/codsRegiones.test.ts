import { describe, it, expect } from 'vitest';
import { codsRegionesDeBD, registrarCodsRegiones, isRegionesCod, CODS_CURADOS, type TiendaBDRow } from '../tiendas';

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
