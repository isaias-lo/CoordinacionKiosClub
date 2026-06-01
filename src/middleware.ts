import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const ROLE_HOME: Record<string, string> = {
  auditor:               '/auditoria',
  'admin-auditoria':     '/auditoria',
  despachador:           '/',
  supervisor:            '/',
  admin:                 '/',
  'recepcion-tienda':    '/tiendas',
  'supervisor-picking':  '/picking',
  'asistente-despacho':  '/despacho-hub',
  'coordinador-flota':   '/despacho',
};

const ROLE_ALLOWED: Record<string, string[]> = {
  auditor:               ['/auditoria', '/historial', '/perfil'],
  'admin-auditoria':     ['/auditoria', '/auditoria-admin', '/perfil'],
  despachador:           ['/', '/despacho-hub', '/despacho', '/despacho/regiones', '/despacho/santiago', '/despacho/conteo', '/despacho/control-flota', '/despacho/estado', '/panel-choferes', '/historial', '/registros', '/tiendas', '/control-interno', '/recepcion-tienda', '/validacion-tienda', '/panel-operaciones', '/perfil'],
  supervisor:            ['/', '/despacho-hub', '/despacho', '/despacho/regiones', '/despacho/santiago', '/despacho/conteo', '/despacho/control-flota', '/despacho/estado', '/panel-choferes', '/historial', '/registros', '/tiendas', '/control-interno', '/recepcion-tienda', '/validacion-tienda', '/panel-operaciones', '/perfil'],
  'recepcion-tienda':    ['/tiendas', '/recepcion-tienda', '/control-interno', '/validacion-tienda', '/perfil'],
  'supervisor-picking':  ['/picking', '/perfil'],
  admin:                 ['*'],
  'asistente-despacho':  ['/despacho-hub', '/despacho/regiones', '/despacho/santiago', '/despacho/conteo', '/perfil'],
  'coordinador-flota':   ['/despacho', '/despacho-hub', '/despacho/control-flota', '/panel-choferes', '/perfil'],
};

function isAllowed(role: string, pathname: string, customPaths?: string[]): boolean {
  const allowed = customPaths ?? ROLE_ALLOWED[role] ?? [];
  if (allowed.includes('*')) return true;
  return allowed.some(p =>
    p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(p + '/')
  );
}

function roleHome(role: string, metaHome?: string, metaPaths?: string[]): string {
  // Only use metaHome if it's actually accessible for this role
  if (metaHome && isAllowed(role, metaHome, metaPaths)) return metaHome;
  if (ROLE_HOME[role]) return ROLE_HOME[role];
  // Custom role: derive home from first allowed path that isn't /perfil
  const first = metaPaths?.find(p => p !== '/perfil' && p !== '*');
  return first ?? '/perfil';
}

const PUBLIC_ROUTES = ['/login', '/registro', '/recuperar-contrasena', '/actualizar-contrasena'];
const PENDING_REDIRECT = '/espera';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    // Cookies malformadas o token expirado sin posibilidad de refresh.
    // Purga todas las cookies sb-* y redirige al login para empezar sesión limpia.
    const cleanResp = NextResponse.redirect(new URL('/login', request.url));
    request.cookies.getAll()
      .filter(c => c.name.startsWith('sb-'))
      .forEach(c => cleanResp.cookies.delete(c.name));
    return cleanResp;
  }

  if (!user) {
    if (PUBLIC_ROUTES.some(p => pathname === p)) return response;
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const role       = (user.user_metadata?.role          as string   | undefined) ?? 'auditor';
  const metaPaths  = user.user_metadata?.allowed_paths  as string[] | undefined;
  const metaHome   = user.user_metadata?.home_path      as string   | undefined;

  if (PUBLIC_ROUTES.some(p => pathname === p)) {
    return NextResponse.redirect(new URL(roleHome(role, metaHome, metaPaths), request.url));
  }

  if (role === 'pending') {
    if (pathname !== PENDING_REDIRECT) {
      return NextResponse.redirect(new URL(PENDING_REDIRECT, request.url));
    }
    return response;
  }

  if (pathname === '/login') {
    return NextResponse.redirect(new URL(roleHome(role, metaHome, metaPaths), request.url));
  }

  // Custom role with no paths in JWT yet (user created before fix) → force re-login to refresh JWT
  const isCustomRole = !Object.keys(ROLE_ALLOWED).includes(role) && role !== 'pending';
  if (isCustomRole && !metaPaths?.length && pathname !== '/login') {
    const cleanResp = NextResponse.redirect(new URL('/login', request.url));
    request.cookies.getAll()
      .filter(c => c.name.startsWith('sb-'))
      .forEach(c => cleanResp.cookies.delete(c.name));
    return cleanResp;
  }

  if (!isAllowed(role, pathname, metaPaths)) {
    return NextResponse.redirect(new URL(roleHome(role, metaHome, metaPaths), request.url));
  }

  return response;
}

export const config = {
  // Excluir archivos estáticos de public/ para que no pasen por auth
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:b64|mjs|ico|png|jpg|jpeg|svg|gif|webp|woff2?|ttf)).*)'],
};
