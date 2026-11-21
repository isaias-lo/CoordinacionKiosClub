// Posibles duplicados: la misma tienda pidiendo lo mismo dos veces. Módulo puro.
//
// ── POR QUÉ «POSIBLE» Y NO «DUPLICADO» ────────────────────────────────────────────────────────
//
// Dos solicitudes de Eléctrico en la misma tienda pueden ser dos ampolletas distintas. El sistema
// no puede saberlo y no lo decide: marca el par y Jesús elige «Unir con la original» o «No es
// duplicado». Por eso esto devuelve PAREJAS y no borra ni esconde nada.
//
// ── SIN CATEGORÍA NO SE MARCA ─────────────────────────────────────────────────────────────────
//
// La categoría es opcional —el supervisor puede dejarla en blanco— y dos solicitudes sin
// categoría de la misma tienda no se parecen en nada: lo único que comparten es la tienda. Si se
// marcaran, el día que una tienda ingrese cinco cosas distintas sin categoría saldrían diez
// parejas falsas y la pantalla «Por revisar» dejaría de servir.
//
// ── SE COMPARA EN LIMPIO ──────────────────────────────────────────────────────────────────────
//
// La categoría es texto libre: «Eléctrico», «electrico» y «ELÉCTRICO » son la misma. Se compara
// sin acentos, sin mayúsculas y sin espacios al borde — la misma regla que ya usa el registro de
// olas sobre texto escrito a mano.

/** Lo mínimo para comparar dos solicitudes. */
export interface SolicitudComparable {
  id: string;
  codigoTienda: string;
  /** Texto libre. Vacío o nulo significa «sin categoría», y entonces no se compara. */
  categoria?: string | null;
  /** Para elegir cuál es la original: la más vieja. ISO o lo que ordene como texto. */
  creadaEn: string;
}

/** Un par a revisar. `original` es la más antigua de las dos. */
export interface ParDuplicado<T> {
  original: T;
  posible: T;
}

/** Sin acentos, sin mayúsculas, sin espacios al borde. */
export function normalizarCategoria(c: string | null | undefined): string {
  return String(c ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

/**
 * Las parejas de posibles duplicados entre solicitudes ABIERTAS.
 *
 * Quien llama filtra qué está abierto: este módulo no conoce los estados, y mezclar las dos cosas
 * haría que agregar un estado nuevo obligara a tocar también esto.
 *
 * Con tres solicitudes iguales se devuelven dos parejas, las dos contra la más antigua, y no un
 * grupo de tres: la pantalla resuelve de a una —«unir con la original»— y un grupo obligaría a
 * decidir las dos de golpe.
 */
export function posiblesDuplicados<T extends SolicitudComparable>(
  abiertas: readonly T[],
): Array<ParDuplicado<T>> {
  const porClave = new Map<string, T[]>();

  for (const s of abiertas) {
    const cat = normalizarCategoria(s.categoria);
    if (!cat) continue;                       // sin categoría no se marca
    const cod = String(s.codigoTienda ?? '').trim().toUpperCase();
    if (!cod) continue;
    const clave = `${cod}|${cat}`;
    const lista = porClave.get(clave) ?? [];
    lista.push(s);
    porClave.set(clave, lista);
  }

  const pares: Array<ParDuplicado<T>> = [];
  for (const lista of porClave.values()) {
    if (lista.length < 2) continue;
    const ordenadas = [...lista].sort((a, b) =>
      a.creadaEn.localeCompare(b.creadaEn) || a.id.localeCompare(b.id));
    const [original, ...resto] = ordenadas;
    for (const posible of resto) pares.push({ original, posible });
  }
  return pares;
}

/** ¿Esta solicitud tiene alguna otra abierta que se le parezca? */
export function tieneDuplicado<T extends SolicitudComparable>(
  solicitud: T,
  abiertas: readonly T[],
): boolean {
  const cat = normalizarCategoria(solicitud.categoria);
  if (!cat) return false;
  const cod = String(solicitud.codigoTienda ?? '').trim().toUpperCase();
  return abiertas.some(o =>
    o.id !== solicitud.id &&
    String(o.codigoTienda ?? '').trim().toUpperCase() === cod &&
    normalizarCategoria(o.categoria) === cat);
}
