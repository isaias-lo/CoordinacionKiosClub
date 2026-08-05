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
      // '/tiendas' (Recepción del conductor) se accede desde Panel Conductor;
      // se quitó del sidebar para evitar duplicado. La ruta sigue activa.
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
  '/perfil', '/tiendas', '/panel-choferes', '/chofer', '/control-cruce',
  '/historial', '/recepcion', '/despacho-hub', '/despacho/conteo',
  '/despacho/santiago/rutas', '/despacho/config-tiendas',
  '/despacho/actividad', // tab Actividad de bodega; acceso vía prefijo de /despacho
  '/admin/usuarios', '/admin/calendario',
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
  { value: '/perfil',          label: 'Perfil'           },
];

// ── Función de acceso (middleware + frontend) ────────────────────

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

const DESPACHO_FULL = [
  '/', '/despacho', '/despacho/regiones', '/despacho/santiago',
  '/despacho/conteo', '/despacho/control-flota', '/despacho/estado',
  '/despacho/config-tiendas', '/panel-choferes', '/conductor-hub',
  '/panel-operaciones', '/registros', '/tiendas', '/control-interno',
  '/validacion-tienda', '/incidencias', '/perfil',
];

export const SYSTEM_ROLE_PATHS: Record<string, string[]> = {
  'auditor':             ['/auditoria', '/registros', '/perfil'],
  'admin-auditoria':     ['/auditoria', '/auditoria-admin', '/perfil'],
  'despachador':         DESPACHO_FULL,
  'supervisor':          DESPACHO_FULL,
  'supervisor-picking':  ['/picking', '/perfil'],
  'admin':               ['*'],
  'asistente-despacho':  ['/despacho', '/despacho/regiones', '/despacho/santiago', '/despacho/conteo', '/despacho/config-tiendas', '/perfil'],
  'coordinador-flota':   ['/despacho', '/despacho/control-flota', '/despacho/config-tiendas', '/panel-choferes', '/perfil'],
  'conductor':           ['/conductor-hub', '/tiendas', '/perfil'],
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
