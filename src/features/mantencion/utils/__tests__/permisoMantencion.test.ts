import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROLES_VE_TODO, veTodo, tiposDeComentario } from '../permisoMantencion';

describe('veTodo', () => {
  it('admin y encargado-mantencion ven todo', () => {
    expect(veTodo('admin')).toBe(true);
    expect(veTodo('encargado-mantencion')).toBe(true);
  });

  it('el supervisor de tienda y cualquier otro, no', () => {
    expect(veTodo('supervisor-tienda')).toBe(false);
    expect(veTodo('tecnico-mantencion')).toBe(false);
    expect(veTodo('')).toBe(false);
    expect(veTodo(null)).toBe(false);
    expect(veTodo(undefined)).toBe(false);
  });

  it('es la MISMA lista que mant_ve_todo() en la base', () => {
    // Si se separan, la API (service role) y el RLS dejarían ver cosas distintas.
    const sql = readFileSync(join(process.cwd(), 'sql/2026-11-19_mantencion_fase1.sql'), 'utf8');
    const fn = sql.slice(sql.indexOf('create or replace function mant_ve_todo'));
    const m = /->>\s*'role'\)\s*in\s*\(([^)]*)\)/.exec(fn);
    expect(m, 'no encontré la lista de roles en mant_ve_todo()').not.toBeNull();
    const enSql = m![1].split(',').map(s => s.trim().replace(/'/g, '')).sort();
    expect(enSql).toEqual([...ROLES_VE_TODO].sort());
  });
});

describe('tiposDeComentario', () => {
  it('la tienda solo responde', () => {
    expect(tiposDeComentario('supervisor-tienda')).toEqual(['respuesta']);
  });

  it('Mantención pregunta y deja notas, pero no responde por la tienda', () => {
    expect(tiposDeComentario('encargado-mantencion')).toEqual(['pregunta', 'nota_mantencion']);
    expect(tiposDeComentario('admin')).not.toContain('respuesta');
  });
});
