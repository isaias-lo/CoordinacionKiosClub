// El "tipo de carga" de una fila de Bodega (Comida / Hogar / Mixto / Chocolate) y qué pasa con las
// medidas al cambiarlo. Puro y testeable: no toca red ni base.
//
// Existe por un detalle que no se ve hasta que se abre Chocolate como opción del PALLET: el
// autorrelleno de medidas miraba solo el contenido, nunca el envase. Un bulto de chocolate mide
// 38×78×52; un pallet mide ~120×100 y llega a 185 de alto. Sin separar los dos casos, marcar un
// pallet como chocolate le habría borrado sus medidas reales y puesto las de una caja.

/**
 * Medidas del BULTO cuyo contenido es chocolate (legado), en cm.
 *
 * Ojo: NO son las de la caja CH de `chocolate.ts` (42×80×56). Son dos cosas distintas que se
 * parecen: esto es un bulto común que lleva chocolate adentro.
 */
export const CHOCOLATE_BULTO_DIMS = { alto: 38, largo: 78, ancho: 52, peso: 5 } as const;

const esChocolate = (c: string) => (c ?? '').toLowerCase() === 'chocolate';

/**
 * Medidas que deben quedar tras cambiar el tipo de carga de una fila, o `null` para no tocarlas.
 *
 * - **Un pallet nunca se toca.** Su carga puede ser chocolate sin que el pallet cambie de tamaño.
 * - Un bulto que pasa a chocolate toma las medidas de la caja (es siempre la misma).
 * - Un bulto que deja de ser chocolate queda en blanco, para que lo midan de nuevo en vez de
 *   heredar las de la caja anterior.
 *
 * Acepta las dos escrituras del sistema: Santiago guarda 'Chocolate' y Nacional 'chocolate'.
 */
export function dimsAlCambiarContenido(
  esPallet: boolean, contenidoNuevo: string, contenidoPrevio: string,
): { alto: string; largo: string; ancho: string } | null {
  if (esPallet) return null;
  if (esChocolate(contenidoNuevo)) {
    return {
      alto:  String(CHOCOLATE_BULTO_DIMS.alto),
      largo: String(CHOCOLATE_BULTO_DIMS.largo),
      ancho: String(CHOCOLATE_BULTO_DIMS.ancho),
    };
  }
  if (esChocolate(contenidoPrevio)) return { alto: '', largo: '', ancho: '' };
  return null;
}

/** Abreviatura de tres letras para el botón. */
export function abreviaturaContenido(t: string): string {
  const c = (t ?? '').toLowerCase();
  if (c === 'comida') return 'Com';
  if (c === 'hogar') return 'Hog';
  if (c === 'chocolate') return 'Cho';
  return 'Mix';
}

/** Nombre completo, para el `title` — que es lo que se lee justo cuando la abreviatura no alcanza. */
export function nombreContenido(t: string): string {
  const c = (t ?? '').toLowerCase();
  if (c === 'comida') return 'Comida';
  if (c === 'hogar') return 'Hogar';
  if (c === 'chocolate') return 'Chocolate';
  return 'Mixto (comida y hogar)';
}
