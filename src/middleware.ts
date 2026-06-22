import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isPathAllowed, SYSTEM_ROLE_PATHS, SYSTEM_ROLE_HOME } from '@/config/routes';

function isAllowed(role: string, pathname: string, customPaths?: string[]): boolean {
  const allowed = customPaths ?? SYSTEM_ROLE_PATHS[role] ?? [];
  return isPathAllowed(allowed, pathname);
}

function roleHome(role: string, metaHome?: string, metaPaths?: string[]): string {
  if (metaHome && isAllowed(role, metaHome, metaPaths)) return metaHome;
  if (SYSTEM_ROLE_HOME[role]) return SYSTEM_ROLE_HOME[role];
  const first = metaPaths?.find(p => p !== '/perfil' && p !== '*');
  return first ?? '/perfil';
}

const PUBLIC_ROUTES = ['/login', '/registro', '/recuperar-contrasena', '/actualizar-contrasena'];
const PENDING_REDIRECT = '/espera';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Manifiesto público del fiscalizador (QR de la ruta): acceso SIN login.
  // La página /r/[token] y la API /api/r/[token] ya son públicas; el QR debe poder
  // abrirse aunque quien escanea no tenga sesión (ni de un rol distinto).
  if (pathname.startsWith('/r/')) return NextResponse.next();

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

  // getSession() validates the JWT locally from the cookie — no network call on every request.
  // When the JWT expires, @supabase/ssr refreshes it automatically (one call per ~1h).
  // getUser() was making a round-trip to Supabase auth on every navigation, causing 504s under load.
  let user = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user ?? null;
  } catch {
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
  const isCustomRole = !Object.keys(SYSTEM_ROLE_PATHS).includes(role) && role !== 'pending';
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
