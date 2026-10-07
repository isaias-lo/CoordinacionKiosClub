import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { puedeAbrir, SYSTEM_ROLE_PATHS, paginaInicial } from '@/config/routes';

// La lógica vive en `config/routes` (pura y con tests): garantiza que la página devuelta sea una
// que el rol PUEDA abrir. Antes devolvía `SYSTEM_ROLE_HOME[role]` a ciegas y eso podía dejar a
// alguien en un bucle de redirección — ver `paginaInicial`.
function roleHome(role: string, metaHome?: string, metaPaths?: string[]): string {
  return paginaInicial(role, metaPaths, metaHome);
}

const PUBLIC_ROUTES = ['/login', '/registro', '/recuperar-contrasena', '/actualizar-contrasena'];
const PENDING_REDIRECT = '/espera';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Manifiesto público del fiscalizador (QR de la ruta): acceso SIN login.
  // La página /r/[token] y la API /api/r/[token] ya son públicas; el QR debe poder
  // abrirse aunque quien escanea no tenga sesión (ni de un rol distinto).
  if (pathname.startsWith('/r/')) return NextResponse.next();

  // Recepción de tienda (QR del manifiesto): página pública, PERO protegida por OTP — la tienda
  // solo puede confirmar tras recibir e ingresar el código enviado a su correo (tiendas.correos).
  // Así no se crea un usuario por tienda (55+) y se verifica identidad. El submit /api/recepcion
  // exige el token del OTP (verifyOtpToken).
  if (pathname === '/recepcion') return NextResponse.next();

  // Galería pública de fotos de recepción (link del Sheet RECEPCIÓN/TIENDA). Solo lectura por id.
  if (pathname.startsWith('/recepcion/galeria/')) return NextResponse.next();

  // Pantalla de "sin conexión" del service worker. Tiene que ser pública por dos motivos: el worker
  // la descarga al instalarse, que puede pasar antes de que alguien inicie sesión, y cuando se
  // muestra no hay red con la que validar nada. No lee datos ni sesión: es un cartel.
  if (pathname === '/offline') return NextResponse.next();

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

  // Redirigir SIN perder lo que Supabase acaba de escribir en `response`.
  //
  // Si al token le quedaban menos de 90 s, `getSession()` lo refrescó y dejó las cookies nuevas en
  // `response`. Un `NextResponse.redirect` es otra respuesta y no las lleva: el navegador se
  // quedaba con el refresh token VIEJO, que Supabase ya dio por usado. Al usarlo de nuevo, pasada
  // la ventana de gracia, Supabase lo toma como robado y revoca la sesión. Pasaba sobre todo al
  // abrir la app instalada, que arranca en `/` y para casi todos los roles es una redirección.
  // Lo mismo con el borrado: si el refresco falló, la cookie rota se quedaba puesta.
  const redirigir = (path: string) => {
    const r = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach(c => r.cookies.set(c));
    return r;
  };

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
    // Se recuerda a dónde iba, para volver ahí después de entrar (un enlace compartido, o la
    // pantalla abierta cuando venció la sesión). `/` no: ahí cada rol tiene su propio inicio.
    if (pathname === '/') return redirigir('/login');
    const destino = pathname + request.nextUrl.search;
    return redirigir(`/login?next=${encodeURIComponent(destino)}`);
  }

  const role       = (user.user_metadata?.role          as string   | undefined) ?? 'auditor';
  const metaPaths  = user.user_metadata?.allowed_paths  as string[] | undefined;
  const metaHome   = user.user_metadata?.home_path      as string   | undefined;

  // /login se abre aunque haya sesión. Antes mandaba de vuelta al inicio de quien estuviera
  // dentro, y en una handheld compartida eso era el "rebote": no había forma de llegar al
  // formulario para poner otra cuenta sin encontrar antes el botón de cerrar sesión. La página
  // muestra quién está dentro y deja seguir o cambiar de cuenta.
  if (pathname === '/login') return response;

  if (PUBLIC_ROUTES.some(p => pathname === p)) {
    return redirigir(roleHome(role, metaHome, metaPaths));
  }

  if (role === 'pending') {
    if (pathname !== PENDING_REDIRECT) {
      return redirigir(PENDING_REDIRECT);
    }
    return response;
  }

  // Custom role with no paths in JWT yet (user created before fix) → force re-login to refresh JWT
  const isCustomRole = !Object.keys(SYSTEM_ROLE_PATHS).includes(role) && role !== 'pending';
  if (isCustomRole && !metaPaths?.length) {
    const cleanResp = NextResponse.redirect(new URL('/login', request.url));
    request.cookies.getAll()
      .filter(c => c.name.startsWith('sb-'))
      .forEach(c => cleanResp.cookies.delete(c.name));
    return cleanResp;
  }

  if (!puedeAbrir(role, pathname, metaPaths)) {
    return redirigir(roleHome(role, metaHome, metaPaths));
  }

  return response;
}

export const config = {
  // Excluir archivos estáticos de public/ para que no pasen por auth.
  //
  // `webmanifest` está acá porque el navegador pide `/manifest.webmanifest` ANTES de que exista
  // sesión — y a veces sin cookies, según el sistema. Si pasa por este middleware recibe un
  // redirect a /login, el navegador lo lee como un manifest inválido y la app deja de ofrecerse
  // para instalar, sin ningún error visible que explique por qué.
  //
  // `sw.js` es el mismo caso y peor: el navegador lo pide sin sesión, y si en vez del service
  // worker recibe el HTML de /login, el registro falla con un error de tipo MIME. Se excluye por
  // nombre y no por extensión `.js` para no abrir la puerta a cualquier otro archivo.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw\\.js|api/|.*\\.(?:b64|mjs|ico|png|jpg|jpeg|svg|gif|webp|webmanifest|woff2?|ttf)).*)'],
};
