// Qué ítem del menú se marca como activo. Puro y testeable.
//
// Existe por m-06: estando en Congelados se marcaban DOS ítems a la vez, Congelados y Enrutador.
// La causa es que `/despacho/congelados` empieza con `/despacho`, y la regla era "coincide o es
// prefijo". Con rutas anidadas eso marca al padre y al hijo.
//
// La regla correcta es la del prefijo MÁS LARGO: entre todas las rutas del menú que calzan, gana la
// más específica. Así `/despacho` sigue activándose dentro de `/despacho/algo-que-no-es-del-menú`,
// pero se apaga cuando ese "algo" sí tiene su propio ítem.

/** ¿`pathname` cae dentro de `ruta`? Exacta o como sección padre. `/` solo calza exacta. */
export function calza(pathname: string, ruta: string): boolean {
  if (ruta === '/') return pathname === '/';
  return pathname === ruta || pathname.startsWith(ruta + '/');
}

/** La ruta del menú que corresponde marcar, o null si ninguna calza. */
export function rutaActiva(pathname: string | null | undefined, rutas: string[]): string | null {
  if (!pathname) return null;
  let mejor: string | null = null;
  for (const r of rutas) {
    if (!calza(pathname, r)) continue;
    if (mejor === null || r.length > mejor.length) mejor = r;
  }
  return mejor;
}
