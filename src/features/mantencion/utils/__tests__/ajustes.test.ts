import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AjustesSchema, CAMPOS_AJUSTE, configDeFila, filaDeConfig, nombreCategoria } from '../ajustes';
import { CONFIG_POR_DEFECTO } from '../tablero';

describe('AjustesSchema', () => {
  it('los valores de la semilla son válidos', () => {
    expect(AjustesSchema.safeParse(CONFIG_POR_DEFECTO).success).toBe(true);
  });

  it('rechaza cero días por solicitud: dividiría el puntaje por cero', () => {
    expect(AjustesSchema.safeParse({ ...CONFIG_POR_DEFECTO, diasPorSolicitud: 0 }).success).toBe(false);
  });

  it('rechaza umbral cero, decimales y números absurdos', () => {
    expect(AjustesSchema.safeParse({ ...CONFIG_POR_DEFECTO, umbralTotal: 0 }).success).toBe(false);
    expect(AjustesSchema.safeParse({ ...CONFIG_POR_DEFECTO, umbralTotal: 2.5 }).success).toBe(false);
    expect(AjustesSchema.safeParse({ ...CONFIG_POR_DEFECTO, diasAntiguedad: 500 }).success).toBe(false);
  });

  it('el peso de una urgente puede ser cero (dejar de priorizarlas)', () => {
    expect(AjustesSchema.safeParse({ ...CONFIG_POR_DEFECTO, pesoUrgente: 0 }).success).toBe(true);
  });
});

describe('configDeFila / filaDeConfig', () => {
  it('ida y vuelta sin perder nada', () => {
    const c = { ...CONFIG_POR_DEFECTO, umbralTotal: 8, pesoUrgente: 3 };
    expect(configDeFila(filaDeConfig(c))).toEqual(c);
  });

  it('una fila vacía cae a la semilla', () => {
    expect(configDeFila(null)).toEqual(CONFIG_POR_DEFECTO);
  });

  it('cada columna existe en mant_config', () => {
    const sql = readFileSync(join(process.cwd(), 'sql/2026-11-19_mantencion_fase1.sql'), 'utf8');
    const tabla = sql.slice(sql.indexOf('create table if not exists mant_config'));
    for (const c of CAMPOS_AJUSTE) expect(tabla, c.columna).toContain(c.columna);
  });
});

describe('nombreCategoria', () => {
  it('limpia espacios', () => {
    expect(nombreCategoria('  Pintura   y  muros ')).toBe('Pintura y muros');
  });

  it('vacío, muy largo o no texto: no sirve', () => {
    expect(nombreCategoria('   ')).toBeNull();
    expect(nombreCategoria('a'.repeat(61))).toBeNull();
    expect(nombreCategoria(3)).toBeNull();
  });
});
