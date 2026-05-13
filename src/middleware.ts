import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const ROLE_HOME: Record<string, string> = {
  auditor:          '/auditoria',
  'admin-auditoria':'/auditoria',
  despachador:      '/',
  supervisor:       '/',
  admin:            '/',
};

const ROLE_ALLOWED: Record<string, string[]> = {
  auditor:          ['/auditoria', '/historial'],
  'admin-auditoria':['/auditoria', '/auditoria-admin'],
  despachador:      ['/', '/despacho', '/recepcion', '/historial'],
  supervisor:       ['/', '/despacho', '/recepcion', '/control-espejos', '/historial'],
  admin:            ['*'],
};

function isAllowed(role: string, pathname: string): boolean {
  const allowed = ROLE_ALLOWED[role] ?? [];
  if (allowed.includes('*')) return true;
  return allowed.some(p =>
    p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(p + '/')
  );
}

function roleHome(role: string): string {
  return ROLE_HOME[role] ?? '/auditoria';
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

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (PUBLIC_ROUTES.some(p => pathname === p)) return response;
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const role = (user.user_metadata?.role as string | undefined) ?? 'auditor';

  if (PUBLIC_ROUTES.some(p => pathname === p)) {
    return NextResponse.redirect(new URL(roleHome(role), request.url));
  }

  if (role === 'pending') {
    if (pathname !== PENDING_REDIRECT) {
      return NextResponse.redirect(new URL(PENDING_REDIRECT, request.url));
    }
    return response;
  }

  if (pathname === '/login') {
    return NextResponse.redirect(new URL(roleHome(role), request.url));
  }

  if (!isAllowed(role, pathname)) {
    return NextResponse.redirect(new URL(roleHome(role), request.url));
  }

  return response;
}

export const config = {
  // Excluir archivos estáticos de public/ para que no pasen por auth
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:b64|mjs|ico|png|jpg|jpeg|svg|gif|webp|woff2?|ttf)).*)'],
};
