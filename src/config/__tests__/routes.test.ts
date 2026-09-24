import { describe, it, expect } from 'vitest';
import { isPathAllowed, SYSTEM_ROLE_PATHS, SYSTEM_ROLE_HOME, ALL_MODULE_PATHS, cleanAllowedPaths, paginaInicial } from '../routes';

describe('isPathAllowed — la regla de acceso que usa el middleware', () => {
  it('el comodín abre todo', () => {
    expect(isPathAllowed(['*'], '/despacho/santiago')).toBe(true);
  });

  it('un permiso registrado NO se regala por prefijo', () => {
    // Es deliberado: tener el Enrutador no da Bodega RM/Costa. Por eso la pestaña necesitaba su
    // propio filtro (ver `tabsPermitidos`).
    expect(isPathAllowed(['/despacho'], '/despacho/santiago')).toBe(false);
    expect(isPathAllowed(['/despacho/congelados'], '/despacho/congelados/santiago')).toBe(false);
  });

  it('una sub-ruta NO registrada sí se hereda', () => {
    expect(isPathAllowed(['/despacho/santiago'], '/despacho/santiago/rutas')).toBe(true);
  });

  it('sin permisos no entra a ninguna parte', () => {
    expect(isPathAllowed([], '/despacho')).toBe(false);
  });
});

// El respaldo de los roles de sistema solo se usa cuando el token no trae `allowed_paths`. Se
// desincroniza de la tabla `roles` sin que nada falle, así que estos tests fijan lo que ya se
// verificó contra la base el 24/09 — si alguien lo cambia sin querer, salta acá.
describe('SYSTEM_ROLE_PATHS — respaldo coherente con lo verificado en la base', () => {
  it('el auditor va a /historial, no a /registros', () => {
    expect(SYSTEM_ROLE_PATHS['auditor']).toContain('/historial');
    expect(SYSTEM_ROLE_PATHS['auditor']).not.toContain('/registros');
  });

  it('el supervisor de Picking llega a Bodega, incluido RM/Costa', () => {
    const p = SYSTEM_ROLE_PATHS['supervisor-picking'];
    for (const r of ['/picking', '/despacho/regiones', '/despacho/santiago', '/despacho/congelados']) {
      expect(p).toContain(r);
    }
  });

  it('el conductor NO lleva /tiendas: se quitó a propósito en la Fase 5', () => {
    // La tabla `roles` todavía lo tiene; acá el código es el correcto y no hay que "sincronizarlo".
    expect(SYSTEM_ROLE_PATHS['conductor']).not.toContain('/tiendas');
  });

  it('cada rol de sistema tiene página inicial, y es una que puede abrir', () => {
    for (const [rol, paths] of Object.entries(SYSTEM_ROLE_PATHS)) {
      const home = SYSTEM_ROLE_HOME[rol];
      expect(home, `${rol} sin home`).toBeTruthy();
      expect(isPathAllowed(paths, home), `${rol}: su home ${home} no está permitido`).toBe(true);
    }
  });

  it('ninguna ruta del respaldo quedó fuera de las válidas', () => {
    // Un path que `cleanAllowedPaths` descarta es una ruta que ya no existe: si aparece acá, el
    // respaldo apunta a una pantalla borrada.
    for (const [rol, paths] of Object.entries(SYSTEM_ROLE_PATHS)) {
      if (paths.includes('*')) continue;
      expect(cleanAllowedPaths(paths), `${rol} tiene rutas inexistentes`).toEqual(paths);
    }
  });

  it('todas las rutas del sidebar son asignables', () => {
    expect(cleanAllowedPaths(ALL_MODULE_PATHS)).toEqual(ALL_MODULE_PATHS);
  });
});

describe('paginaInicial — nunca mandar a una página que el rol no puede abrir', () => {
  it('el bucle de redirección que había: home `/` fuera de los permisos', () => {
    // Era el caso real de `despachador`: `/` es su home, pero `cleanAllowedPaths` la borraba al
    // guardar el rol, y `roleHome` la devolvía igual → redirección infinita.
    const sinLaRaiz = ['/perfil', '/panel-choferes', '/despacho'];
    const destino = paginaInicial('despachador', sinLaRaiz, '/');
    expect(destino).not.toBe('/');
    expect(isPathAllowed(sinLaRaiz, destino)).toBe(true);
  });

  it('si la home del token sirve, se usa esa', () => {
    expect(paginaInicial('supervisor-picking', ['/picking', '/perfil'], '/picking')).toBe('/picking');
  });

  it('si la del token no sirve, cae a la del rol', () => {
    expect(paginaInicial('supervisor-picking', ['/picking', '/perfil'], '/auditoria')).toBe('/picking');
  });

  it('manda a Perfil como ÚLTIMO recurso, no como primero', () => {
    expect(paginaInicial('rol-raro', ['/perfil', '/incidencias'], undefined)).toBe('/incidencias');
    expect(paginaInicial('rol-raro', ['/perfil'], undefined)).toBe('/perfil');
    expect(paginaInicial('rol-raro', [], undefined)).toBe('/perfil');
  });

  it('con el token sin rutas usa el respaldo del rol', () => {
    expect(paginaInicial('auditor', undefined, undefined)).toBe('/auditoria');
  });

  it('para TODO rol de sistema devuelve algo abrible (con y sin token)', () => {
    for (const [rol, paths] of Object.entries(SYSTEM_ROLE_PATHS)) {
      for (const metaPaths of [undefined, paths]) {
        const destino = paginaInicial(rol, metaPaths, SYSTEM_ROLE_HOME[rol]);
        expect(isPathAllowed(paths, destino), `${rol} → ${destino} no es abrible`).toBe(true);
      }
    }
  });
});

describe('rutas vivas que cleanAllowedPaths ya no borra', () => {
  it('`/` y Control de Flota sobreviven a un guardado del rol', () => {
    // Las dos páginas EXISTEN (src/app/page.tsx, src/app/despacho/control-flota/page.tsx) y
    // faltaban en las rutas válidas: al guardar el rol desde el panel se caían sin aviso.
    const paths = ['/', '/despacho/control-flota', '/perfil'];
    expect(cleanAllowedPaths(paths)).toEqual(paths);
  });

  it('una ruta que de verdad ya no existe sigue cayéndose', () => {
    // `/recepcion-tienda` se eliminó junto con su rol; que se limpie es lo correcto.
    expect(cleanAllowedPaths(['/perfil', '/recepcion-tienda'])).toEqual(['/perfil']);
  });
});
