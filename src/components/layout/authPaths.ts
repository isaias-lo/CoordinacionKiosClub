/** Rutas que se renderizan SIN el shell de la app (sin sidebar): login, registro de
 *  usuario, recuperación de contraseña, espera y las páginas públicas de QR (/r/...). */
export const AUTH_PATHS = [
  '/login',
  '/registro',
  '/recuperar-contrasena',
  '/actualizar-contrasena',
  '/espera',
  '/r/',
  '/recepcion',   // recepción pública por QR del manifiesto de tienda (sin sidebar; scroll propio)
];

/**
 * ¿La ruta debe ir SIN sidebar (auth/pública)?
 * Match por ruta exacta o por límite de segmento (`p + '/'`), NO por prefijo laxo:
 * con `startsWith(p)` a secas, '/registros' coincidía con '/registro' (registro de
 * usuario) y la página de registros quedaba sin sidebar. Para prefijos que ya terminan
 * en '/' (p. ej. '/r/') se usan tal cual.
 */
export function isAuthPath(pathname: string): boolean {
  if (!pathname) return false;
  return AUTH_PATHS.some(p => {
    const prefix = p.endsWith('/') ? p : p + '/';
    return pathname === p || pathname.startsWith(prefix);
  });
}
