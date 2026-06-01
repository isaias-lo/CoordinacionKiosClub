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
      { path: '/despacho-hub',           label: 'Hub Despacho'           },
      { path: '/despacho',               label: 'Enrutador'              },
      { path: '/despacho/regiones',      label: 'Nacional'               },
      { path: '/despacho/santiago',      label: 'RM / Costa'             },
      { path: '/despacho/conteo',        label: 'Conteo / Consolidación' },
      { path: '/despacho/control-flota', label: 'Control de Flota'       },
      { path: '/despacho/estado',        label: 'Estado / Seguimiento'   },
      { path: '/panel-choferes',         label: 'Panel Choferes'         },
      { path: '/panel-operaciones',      label: 'Panel Operaciones'      },
      { path: '/tiendas',                label: 'Conductores / Tiendas'  },
      { path: '/historial',              label: 'Historial'              },
      { path: '/registros',              label: 'Registros'              },
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
    id: 'picking', label: 'Picking', color: '#F59E0B',
    routes: [
      { path: '/picking', label: 'Picking' },
    ],
  },
];

// Todos los paths registrados (sin /perfil, que siempre se incluye aparte).
export const ALL_MODULE_PATHS: string[] = MODULE_GROUPS.flatMap(g => g.routes.map(r => r.path));

// Opciones de página inicial para el editor de roles.
export const HOME_OPTIONS: { value: string; label: string }[] = [
  { value: '/despacho-hub',    label: 'Hub Despacho'     },
  { value: '/despacho',        label: 'Enrutador'        },
  { value: '/control-interno', label: 'Control Interno'  },
  { value: '/auditoria',       label: 'Auditoría'        },
  { value: '/panel-choferes',  label: 'Panel Choferes'   },
  { value: '/tiendas',         label: 'Conductores'      },
  { value: '/picking',         label: 'Picking'          },
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
  '/', '/despacho-hub', '/despacho', '/despacho/regiones', '/despacho/santiago',
  '/despacho/conteo', '/despacho/control-flota', '/despacho/estado',
  '/panel-choferes', '/panel-operaciones', '/historial', '/registros',
  '/tiendas', '/control-interno', '/recepcion-tienda', '/validacion-tienda', '/perfil',
];

export const SYSTEM_ROLE_PATHS: Record<string, string[]> = {
  'auditor':             ['/auditoria', '/historial', '/perfil'],
  'admin-auditoria':     ['/auditoria', '/auditoria-admin', '/perfil'],
  'despachador':         DESPACHO_FULL,
  'supervisor':          DESPACHO_FULL,
  'recepcion-tienda':    ['/tiendas', '/recepcion-tienda', '/control-interno', '/validacion-tienda', '/perfil'],
  'supervisor-picking':  ['/picking', '/perfil'],
  'admin':               ['*'],
  'asistente-despacho':  ['/despacho-hub', '/despacho/regiones', '/despacho/santiago', '/despacho/conteo', '/perfil'],
  'coordinador-flota':   ['/despacho', '/despacho-hub', '/despacho/control-flota', '/panel-choferes', '/perfil'],
};

export const SYSTEM_ROLE_HOME: Record<string, string> = {
  'auditor':             '/auditoria',
  'admin-auditoria':     '/auditoria',
  'despachador':         '/',
  'supervisor':          '/',
  'recepcion-tienda':    '/tiendas',
  'supervisor-picking':  '/picking',
  'admin':               '/',
  'asistente-despacho':  '/despacho-hub',
  'coordinador-flota':   '/despacho',
};
