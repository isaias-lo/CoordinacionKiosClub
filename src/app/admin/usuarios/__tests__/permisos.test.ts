import { describe, it, expect } from 'vitest';
import { groupState, applyGroupToggle, slugify } from '../permisos';
import type { ModuleGroup } from '@/config/routes';

// Fixture mínimo de grupo (solo lo que usan las funciones puras).
const group = {
  id: 'despacho',
  label: 'Despacho',
  color: '#2563EB',
  routes: [
    { path: '/despacho', label: 'Bodega' },
    { path: '/enrutador', label: 'Enrutador' },
    { path: '/estado', label: 'Estado' },
  ],
} as unknown as ModuleGroup;

describe('groupState', () => {
  it('none cuando no hay ninguna ruta del grupo', () => {
    expect(groupState(group, [])).toBe('none');
    expect(groupState(group, ['/otra', '/perfil'])).toBe('none');
  });
  it('some cuando hay algunas pero no todas', () => {
    expect(groupState(group, ['/despacho'])).toBe('some');
    expect(groupState(group, ['/despacho', '/estado'])).toBe('some');
  });
  it('all cuando están todas las rutas del grupo', () => {
    expect(groupState(group, ['/despacho', '/enrutador', '/estado'])).toBe('all');
  });
  it('all aunque sobren rutas externas', () => {
    expect(groupState(group, ['/despacho', '/enrutador', '/estado', '/perfil'])).toBe('all');
  });
});

describe('applyGroupToggle', () => {
  it('agrega las faltantes cuando el grupo está incompleto', () => {
    const out = applyGroupToggle(group, ['/despacho', '/perfil']);
    expect(out).toContain('/perfil');            // conserva las externas
    expect(out).toContain('/despacho');
    expect(out).toContain('/enrutador');
    expect(out).toContain('/estado');
  });
  it('no duplica las que ya estaban', () => {
    const out = applyGroupToggle(group, ['/despacho', '/enrutador', '/perfil']);
    expect(out.filter(p => p === '/despacho')).toHaveLength(1);
    expect(groupState(group, out)).toBe('all');
  });
  it('quita el grupo entero cuando estaba completo, preservando externas', () => {
    const out = applyGroupToggle(group, ['/despacho', '/enrutador', '/estado', '/perfil']);
    expect(out).toEqual(['/perfil']);
    expect(groupState(group, out)).toBe('none');
  });
  it('desde vacío concede todo el grupo', () => {
    expect(groupState(group, applyGroupToggle(group, []))).toBe('all');
  });
});

describe('slugify', () => {
  it('minúsculas y guiones por espacios', () => {
    expect(slugify('Coordinador General')).toBe('coordinador-general');
  });
  it('quita acentos', () => {
    expect(slugify('Recepción Ñuñoa')).toBe('recepcion-nunoa');
  });
  it('descarta caracteres no válidos', () => {
    expect(slugify('Rol #1 (nuevo)!')).toBe('rol-1-nuevo');
  });
  it('colapsa guiones múltiples', () => {
    expect(slugify('a  --  b')).toBe('a-b');
  });
  it('trunca a 32 caracteres', () => {
    expect(slugify('a'.repeat(50)).length).toBe(32);
  });
});
