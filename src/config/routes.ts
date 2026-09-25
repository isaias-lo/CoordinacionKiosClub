// ─────────────────────────────────────────────────────────────────
// Fuente única de verdad para todas las rutas de la aplicación.
//
// Para agregar una nueva página al sistema:
//   1. Agrégala al ModuleGroup correspondiente (o crea uno nuevo).
//   2. Listo — aparecerá automáticamente en el panel de permisos
//      y el middleware la reconocerá sin cambios adicionales.
// ─────────────────────────────────────────────────────────────────

// `hidden`: la ruta sigue REGISTRADA (permisos, middleware, ALL_MODULE_PATHS) pero NO se
// muestra en el sidebar. Se usa para consolidar Nacional+RM/Costa bajo una sola entrada
// "Bodega" sin cambiar los permisos (santiago sigue registrada → la regla de prefijo la
// sigue excluyendo → nadie gana acceso nuevo). El acceso a RM/Costa se hace por el tab.
export type RouteEntry = { path: string; label: string; hidden?: boolean };

export type ModuleGroup = {
  id:     string;
  label:  string;
  color:  string;
  routes: RouteEntry[];
};

// ── Módulos y rutas ──────────────────────────────────────────────

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: 'abastecimiento', label: 'Abastecimiento', color: '#F59E0B',
    routes: [
      { path: '/picking', label: 'Picking' },
    ],
  },
  {
    id: 'auditoria', label: 'Auditoría', color: '#9333EA',
    routes: [
      { path: '/auditoria',       label: 'Auditoría'          },
      { path: '/auditoria-admin', label: 'Revisión Auditoría' },
    ],
  },
  {
    id: 'despacho', label: 'Despacho', color: '#2563EB',
    routes: [
      // Bodega: una sola entrada en el sidebar. RM/Costa queda REGISTRADA (permisos intactos)
      // pero oculta del sidebar; se llega por el tab dentro del módulo BODEGA.
      { path: '/despacho/regiones',      label: 'Bodega'                 },
      { path: '/despacho/santiago',      label: 'RM / Costa', hidden: true },
      { path: '/despacho/congelados',           label: 'Congelados'                       },
      { path: '/despacho/congelados/santiago',  label: 'RM / Costa (Cong.)', hidden: true },
      { path: '/despacho',               label: 'Enrutador'              },
    ],
  },
  {
    id: 'seguimiento', label: 'Seguimiento', color: '#D97706',
    routes: [
      // Panel unificado: /registros es la URL canónica (renderiza el panel Estado/Seguimiento +
      // Historial). /despacho/estado sigue registrada (permisos/middleware) pero oculta del sidebar
      // y redirige a /registros — así no aparece duplicada y no rompe enlaces antiguos.
      { path: '/despacho/estado',        label: 'Estado / Seguimiento', hidden: true },
      { path: '/registros',              label: 'Estado / Registros'    },
      { path: '/incidencias',            label: 'Incidencias'            },
    ],
  },
  {
    id: 'flota', label: 'Flota', color: '#EA580C',
    routes: [
      { path: '/conductor-hub',          label: 'Panel Conductor'        },
      { path: '/panel-operaciones',      label: 'Panel Operaciones'      },
      // 'Control de Flota' (/despacho/control-flota) se quitó del sidebar: la misma
      // gestión vive en el Enrutador → tab FLOTA → Gestionar. La ruta sigue activa.
      // '/tiendas' ("Entregar en Tienda") se retiró del rol `conductor` en la Fase 5 del Panel
      // Conductor — "Registrar entrega" (dentro de /conductor-hub) es ahora el único camino para
      // marcar una entrega. La ruta sigue activa para los demás roles que la usan.
      // Pantalla de solo lectura para una persona de flota externa (conteo estimado
      // de pallets/bultos/chocolates del día). `hidden`: registrada para permisos
      // (aparece en el checklist y puede asignarse como home) pero fuera del sidebar
      // normal — esta persona entra directo a ella, no navega el resto de la app.
      { path: '/conteo-flota',           label: 'Conteo de Flota', hidden: true },
    ],
  },
  {
    id: 'control-interno', label: 'Control Interno', color: '#10B981',
    routes: [
      { path: '/control-interno/control-cruce',  label: 'Control Cruce'      },
      { path: '/admin/tiendas',                  label: 'Config. Tiendas'    },
    ],
  },
  {
    id: 'otros', label: 'Otros', color: '#6B7280',
    routes: [
      { path: '/validacion-tienda', label: 'Validación Tienda' },
    ],
  },
];

// Todos los paths registrados (sin /perfil, que siempre se incluye aparte).
export const ALL_MODULE_PATHS: string[] = MODULE_GROUPS.flatMap(g => g.routes.map(r => r.path));

// Rutas REALES que existen como página pero NO están en el sidebar/MODULE_GROUPS
// (ej. /tiendas se accede desde Panel Conductor). Se usan para limpiar de los
// permisos de un rol las rutas que ya NO existen, sin borrar accesos válidos.
// ⚠️ Si agregas una página nueva fuera del sidebar, súmala aquí.
const EXTRA_REAL_PATHS: string[] = [
  // `/` es la home de `despachador` y `supervisor`, y existe (src/app/page.tsx). Faltaba acá, así
  // que `cleanAllowedPaths` la BORRABA al guardar el rol desde el panel — y como `roleHome` la
  // devolvía igual, el middleware mandaba a una ruta prohibida y de ahí otra vez a la misma:
  // bucle de redirección. Bastaba que un admin guardara ese rol tocando cualquier otra casilla.
  '/',
  // 'Control de Flota' salió del sidebar pero LA PÁGINA SIGUE (src/app/despacho/control-flota).
  // El comentario de abajo ya lo decía —"La ruta sigue activa"— y sin embargo no estaba en esta
  // lista: `despachador` y `coordinador-flota` la tienen en la tabla y la perdían al primer guardado.
  '/despacho/control-flota',
  '/perfil', '/tiendas', '/panel-choferes', '/chofer', '/control-cruce',
  '/historial', '/recepcion', '/despacho-hub', '/despacho/conteo',
  '/despacho/santiago/rutas', '/despacho/config-tiendas',
  '/despacho/actividad', // tab Actividad de bodega; acceso vía prefijo de /despacho
  '/admin/usuarios', '/admin/calendario', '/admin/sistema',
  '/control-interno', // placeholder, no acceso directo desde sidebar
];

// Conjunto de paths válidos para asignar a un rol (sidebar + reales no-sidebar).
export const VALID_PERMISSION_PATHS: ReadonlySet<string> = new Set([...ALL_MODULE_PATHS, ...EXTRA_REAL_PATHS]);

/** Quita de allowed_paths las rutas que ya no existen (deja '*' y rutas reales). */
export function cleanAllowedPaths(paths: string[]): string[] {
  return paths.filter(p => p === '*' || VALID_PERMISSION_PATHS.has(p));
}

// Opciones de página inicial para el editor de roles.
export const HOME_OPTIONS: { value: string; label: string }[] = [
  { value: '/despacho',        label: 'Enrutador'        },
  { value: '/control-interno', label: 'Control Interno'  },
  { value: '/auditoria',       label: 'Auditoría'        },

  { value: '/tiendas',         label: 'Conductores'      },
  { value: '/picking',         label: 'Abastecimiento'    },
  { value: '/conteo-flota',    label: 'Conteo de Flota'  },
  { value: '/perfil',          label: 'Perfil'           },
];

// ── Función de acceso (middleware + frontend) ────────────────────

/** Las rutas efectivas de un rol: las del token si vienen, si no el respaldo de código. */
export function rutasDeRol(role: string, metaPaths?: string[]): string[] {
  return metaPaths ?? SYSTEM_ROLE_PATHS[role] ?? [];
}

/**
 * A qué página mandar a alguien, garantizando que PUEDA abrirla.
 *
 * Antes esto vivía en el middleware y devolvía `SYSTEM_ROLE_HOME[role]` sin comprobar nada. Con eso,
 * un rol cuya home no estuviera entre sus rutas entraba en bucle: el middleware ve una ruta
 * prohibida → redirige a la home → la home también está prohibida → redirige a la home…
 *
 * No era teórico: `/` es la home de `despachador` y `supervisor`, y `cleanAllowedPaths` la borraba
 * de sus permisos al guardar el rol (no estaba en las rutas válidas). Un guardado en el panel y esa
 * persona no podía entrar a ninguna parte.
 *
 * El orden es el de siempre; lo único nuevo es que cada candidato se valida antes de devolverlo.
 */
export function paginaInicial(role: string, metaPaths?: string[], metaHome?: string): string {
  const allowed = rutasDeRol(role, metaPaths);
  const sirve = (p?: string): boolean => !!p && isPathAllowed(allowed, p);
  if (sirve(metaHome)) return metaHome!;
  if (sirve(SYSTEM_ROLE_HOME[role])) return SYSTEM_ROLE_HOME[role];
  // Cualquier ruta propia antes que `/perfil`: mandar a Perfil a quien tiene trabajo que hacer es
  // el último recurso, no el primero.
  return allowed.find(p => p !== '/perfil' && p !== '*') ?? '/perfil';
}

export function isPathAllowed(allowed: string[], pathname: string): boolean {
  if (allowed.includes('*')) return true;
  return allowed.some(p => {
    if (p === '/') return pathname === '/';
    if (pathname === p) return true;
    if (pathname.startsWith(p + '/')) {
      // Prefix match solo aplica si el sub-path no es un permiso registrado propio.
      // Ej: tener /despacho NO da acceso a /despacho/santiago (permiso separado).
      //     pero tener /despacho/santiago SÍ da acceso a /despacho/santiago/rutas.
      return !ALL_MODULE_PATHS.includes(pathname);
    }
    return false;
  });
}

// ── Roles de sistema (fallback para middleware) ──────────────────
// Los roles creados en el panel admin viven solo en Supabase y usan
// allowed_paths del JWT. Estos son los roles built-in cuyas rutas
// están definidas en código como respaldo si el JWT aún no tiene
// allowed_paths (usuarios que no han vuelto a iniciar sesión).
//
// ⚠️ LA VERDAD ES LA TABLA `roles`, NO ESTA LISTA. Esto es solo el respaldo para un token sin
// `allowed_paths`, y por eso se desincroniza sin que nadie lo note: nada falla mientras todos los
// tokens traigan sus rutas.
//
// Medido el 24/09: 2 de 3 auditores NO tienen `allowed_paths` en el token (último ingreso el
// 28/05), así que para ellos manda esta lista — y decía `/registros` donde la tabla dice
// `/historial`. O sea: acceso a un panel que el admin no les dio, y sin el que sí. Corregido.
//
// El drift va en LAS DOS DIRECCIONES, así que no se sincroniza a ciegas:
//
//   · `conductor`: la tabla todavía tiene `/tiendas`, pero el código lo quitó A PROPÓSITO en la
//     Fase 5 del Panel Conductor (ver el comentario abajo). Acá el código es lo correcto y la
//     TABLA es la que está vieja.
//   · `despachador` y `supervisor`: el código (DESPACHO_FULL) es más amplio que la tabla. No se
//     recorta sin revisarlo con el coordinador — hoy no afecta a nadie porque los dos usuarios
//     con esos roles sí traen sus rutas en el token.
//
// Lo que cierra el tema de raíz no es código: es rellenar `allowed_paths` en los usuarios que no
// lo tienen (el PATCH de /api/admin/roles ya sabe hacerlo). Con eso este respaldo deja de usarse.

const DESPACHO_FULL = [
  '/', '/despacho', '/despacho/regiones', '/despacho/santiago',
  '/despacho/conteo', '/despacho/control-flota', '/despacho/estado',
  '/despacho/config-tiendas', '/panel-choferes', '/conductor-hub',
  '/panel-operaciones', '/registros', '/tiendas', '/control-interno',
  '/validacion-tienda', '/incidencias', '/perfil',
  '/despacho/congelados', '/despacho/congelados/santiago',
];

export const SYSTEM_ROLE_PATHS: Record<string, string[]> = {
  // La tabla dice `/historial`, no `/registros`. Importa de verdad: 2 de 3 auditores no traen
  // rutas en el token, así que esta lista es la que los gobierna.
  'auditor':             ['/auditoria', '/historial', '/perfil'],
  'admin-auditoria':     ['/auditoria', '/auditoria-admin', '/perfil'],
  'despachador':         DESPACHO_FULL,
  'supervisor':          DESPACHO_FULL,
  // Los supervisores de Picking trabajan Bodega desde el cambio del 22/09 (el chocolate se pesa
  // en Bodega). La tabla ya lo refleja; esta lista se había quedado en las dos rutas originales,
  // así que un token sin rutas los habría dejado sin Bodega y sin explicación.
  'supervisor-picking':  ['/picking', '/perfil', '/despacho/regiones', '/despacho/congelados', '/despacho/santiago'],
  'admin':               ['*'],
  'asistente-despacho':  ['/despacho', '/despacho/regiones', '/despacho/santiago', '/despacho/conteo', '/despacho/config-tiendas', '/despacho/congelados', '/despacho/congelados/santiago', '/perfil'],
  'coordinador-flota':   ['/despacho', '/despacho/control-flota', '/despacho/config-tiendas', '/panel-choferes', '/perfil'],
  // [Panel Conductor · Fase 5] '/tiendas' ("Entregar en Tienda") ya no está acá — se retiró en
  // favor de "Registrar entrega" dentro de /conductor-hub, que ahora es el único flujo de entrega.
  'conductor':           ['/conductor-hub', '/perfil'],
};

export const SYSTEM_ROLE_HOME: Record<string, string> = {
  'auditor':             '/auditoria',
  'admin-auditoria':     '/auditoria',
  'despachador':         '/',
  'supervisor':          '/',
  'supervisor-picking':  '/picking',
  'admin':               '/',
  'asistente-despacho':  '/despacho',
  'coordinador-flota':   '/despacho',
  'conductor':           '/conductor-hub',
};
