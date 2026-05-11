import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const ROLE_HOME: Record<string, string> = {
  auditor:     '/auditoria',
  despachador: '/',
  admin:       '/',
};

const ROLE_ALLOWED: Record<string, string[]> = {
  auditor:     ['/auditoria', '/historial'],
  despachador: ['/', '/despacho', '/recepcion', '/historial'],
  admin:       ['*'],
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

  // ── Not authenticated ──
  if (!user) {
    if (pathname === '/login') return response;
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Role is stored in JWT user_metadata — no DB call needed
  const role = (user.user_metadata?.role as string | undefined) ?? 'auditor';

  // ── Authenticated on login page → redirect to role home ──
  if (pathname === '/login') {
    return NextResponse.redirect(new URL(roleHome(role), request.url));
  }

  // ── Role-based route protection ──
  if (!isAllowed(role, pathname)) {
    return NextResponse.redirect(new URL(roleHome(role), request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
