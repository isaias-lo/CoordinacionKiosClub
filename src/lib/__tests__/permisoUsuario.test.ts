import { describe, it, expect } from 'vitest';
import { permisoDe, permisoParaRol, reemplazoDePermiso } from '../permisoUsuario';

describe('reemplazoDePermiso', () => {
  // Supabase mezcla app_metadata: lo que no se manda queda. Solo null borra.
  it('manda en null las claves que el rol nuevo no trae, para que no sobrevivan las del anterior', () => {
    expect(reemplazoDePermiso({ role: 'auditor' })).toEqual({
      role: 'auditor', allowed_paths: null, home_path: null, permissions: null,
    });
  });

  it('con el permiso completo manda las cuatro claves con su valor', () => {
    const p = { role: 'web', allowed_paths: ['/web'], home_path: '/web', permissions: { w: 'edit' as const } };
    expect(reemplazoDePermiso(p)).toEqual(p);
  });

  it('no toca provider ni providers: no los nombra', () => {
    expect(Object.keys(reemplazoDePermiso({ role: 'x' })).sort())
      .toEqual(['allowed_paths', 'home_path', 'permissions', 'role']);
  });
});

describe('permisoDe', () => {
  it('lee el rol, las rutas, el inicio y los permisos de app_metadata', () => {
    const u = {
      app_metadata: {
        provider: 'email',
        role: 'asistente-despacho',
        allowed_paths: ['/despacho-hub', '/perfil'],
        home_path: '/despacho-hub',
        permissions: { despacho: 'edit', flota: 'read' },
      },
    };
    expect(permisoDe(u)).toEqual({
      role: 'asistente-despacho',
      allowed_paths: ['/despacho-hub', '/perfil'],
      home_path: '/despacho-hub',
      permissions: { despacho: 'edit', flota: 'read' },
    });
  });

  it('IGNORA el rol que venga en user_metadata: ese lo escribe el propio usuario', () => {
    const u = { user_metadata: { role: 'admin' }, app_metadata: { role: 'web' } };
    expect(permisoDe(u).role).toBe('web');
  });

  it('con rol solo en user_metadata no hay rol: no se le cree', () => {
    const u = { user_metadata: { role: 'admin', allowed_paths: ['*'] }, app_metadata: { provider: 'email' } };
    expect(permisoDe(u)).toEqual({});
  });

  it('sin usuario o sin app_metadata devuelve vacío', () => {
    expect(permisoDe(null)).toEqual({});
    expect(permisoDe(undefined)).toEqual({});
    expect(permisoDe({})).toEqual({});
    expect(permisoDe({ app_metadata: 'admin' })).toEqual({});
    expect(permisoDe({ app_metadata: ['admin'] })).toEqual({});
  });

  it('un rol vacío o que no es texto no cuenta', () => {
    expect(permisoDe({ app_metadata: { role: '' } }).role).toBeUndefined();
    expect(permisoDe({ app_metadata: { role: '   ' } }).role).toBeUndefined();
    expect(permisoDe({ app_metadata: { role: 1 } }).role).toBeUndefined();
  });

  it('allowed_paths que no es arreglo se descarta; dentro del arreglo solo quedan textos', () => {
    expect(permisoDe({ app_metadata: { allowed_paths: '/admin' } }).allowed_paths).toBeUndefined();
    expect(permisoDe({ app_metadata: { allowed_paths: ['/a', 3, null, '/b'] } }).allowed_paths).toEqual(['/a', '/b']);
  });

  it('allowed_paths vacío se conserva vacío (el middleware decide qué hacer con eso)', () => {
    expect(permisoDe({ app_metadata: { allowed_paths: [] } }).allowed_paths).toEqual([]);
  });

  it('en permissions solo pasan los niveles edit y read', () => {
    const u = { app_metadata: { permissions: { a: 'edit', b: 'read', c: 'admin', d: true } } };
    expect(permisoDe(u).permissions).toEqual({ a: 'edit', b: 'read' });
  });
});

describe('permisoParaRol', () => {
  it('estampa el rol con las rutas, el inicio y los permisos de su fila', () => {
    const fila = { allowed_paths: ['/perfil'], home_path: '/perfil', permissions: { mant: 'read' } };
    expect(permisoParaRol('supervisor-tienda', fila)).toEqual({
      role: 'supervisor-tienda',
      allowed_paths: ['/perfil'],
      home_path: '/perfil',
      permissions: { mant: 'read' },
    });
  });

  it('sin fila va solo el rol (manda el respaldo de SYSTEM_ROLE_PATHS)', () => {
    expect(permisoParaRol('auditor', null)).toEqual({ role: 'auditor' });
    expect(permisoParaRol('auditor')).toEqual({ role: 'auditor' });
  });

  it('una fila sin inicio cae en /perfil, y sin rutas en arreglo vacío', () => {
    expect(permisoParaRol('x', {})).toEqual({ role: 'x', allowed_paths: [], home_path: '/perfil' });
  });

  it('lo que estampa se vuelve a leer igual', () => {
    const p = permisoParaRol('web', { allowed_paths: ['/web'], home_path: '/web', permissions: { w: 'edit' } });
    expect(permisoDe({ app_metadata: p })).toEqual(p);
  });
});
