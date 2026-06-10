// ─────────────────────────────────────────────────────────────────
// Fuente única de verdad para todas las rutas de la aplicación.
//
// Para agregar una nueva página al sistema:
//   1. Agrégala al ModuleGroup correspondiente (o crea uno nuevo).
//   2. Listo — aparecerá automáticamente en el panel de permisos
//      y el middleware la reconocerá sin cambios adicionales.
// ─────────────────────────────────────────────────────────────────

export type RouteEntry = { path: string; label: string };

export type ModuleGroup = {
  id:     string;
  label:  string;
  color:  string;
  routes: RouteEntry[];
};

// ── Módulos y rutas ──────────────────────────────────────────────

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: 'despacho', label: 'Despacho', color: '#2563EB',
    routes: [
      { path: '/despacho',               label: 'Enrutador'              },
      { path: '/despacho/regiones',      label: 'Nacional'               },
      { path: '/despacho/santiago',      label: 'RM / Costa'             },
    ],
  },
  {
    id: 'flota', label: 'Flota', color: '#EA580C',
    routes: [
      { path: '/despacho/control-flota', label: 'Control de Flota'       },
      { path: '/conductor-hub',          label: 'Panel Conductor'        },
      { path: '/panel-operaciones',      label: 'Panel Operaciones'      },
      // '/tiendas' (Recepción del conductor) se accede desde Panel Conductor;
      // se quitó del sidebar para evitar duplicado. La ruta sigue activa.
    ],
  },
  {
    id: 'seguimiento', label: 'Seguimiento', color: '#D97706',
    routes: [
      { path: '/despacho/estado',        label: 'Estado / Seguimiento'   },
      { path: '/registros',              label: 'Historial / Registros'  },
      { path: '/incidencias',            label: 'Incidencias'            },
    ],
  },
  {
    id: 'control-interno', label: 'Control Interno', color: '#10B981',
    routes: [
      { path: '/control-interno',   label: 'Control Interno'    },
      { path: '/recepcion-tienda',  label: 'Recepción Tienda'   },
      { path: '/validacion-tienda', label: 'Validación Tienda'  },
      { path: '/admin/tiendas',     label: 'Config. Tiendas'    },
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
    id: 'abastecimiento', label: 'Abastecimiento', color: '#F59E0B',
    routes: [
      { path: '/picking', label: 'Picking' },
    ],
  },
];

// Todos los paths registrados (sin /perfil, que siempre se incluye aparte).
export const ALL_MODULE_PATHS: string[] = MODULE_GROUPS.flatMap(g => g.routes.map(r => r.path));

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
  '/recepcion-tienda', '/validacion-tienda', '/incidencias', '/perfil',
];

export const SYSTEM_ROLE_PATHS: Record<string, string[]> = {
  'auditor':             ['/auditoria', '/registros', '/perfil'],
  'admin-auditoria':     ['/auditoria', '/auditoria-admin', '/perfil'],
  'despachador':         DESPACHO_FULL,
  'supervisor':          DESPACHO_FULL,
  'recepcion-tienda':    ['/tiendas', '/recepcion-tienda', '/control-interno', '/validacion-tienda', '/perfil'],
  'supervisor-picking':  ['/picking', '/perfil'],
  'admin':               ['*'],
  'asistente-despacho':  ['/despacho', '/despacho/regiones', '/despacho/santiago', '/despacho/conteo', '/despacho/config-tiendas', '/perfil'],
  'coordinador-flota':   ['/despacho', '/despacho/control-flota', '/despacho/config-tiendas', '/panel-choferes', '/perfil'],
};

export const SYSTEM_ROLE_HOME: Record<string, string> = {
  'auditor':             '/auditoria',
  'admin-auditoria':     '/auditoria',
  'despachador':         '/',
  'supervisor':          '/',
  'recepcion-tienda':    '/tiendas',
  'supervisor-picking':  '/picking',
  'admin':               '/',
  'asistente-despacho':  '/despacho',
  'coordinador-flota':   '/despacho',
};
