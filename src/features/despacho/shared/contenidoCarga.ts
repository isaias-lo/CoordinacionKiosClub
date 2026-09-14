import type { ContenidoSantiago } from '../santiago/types';
import type { TipoContenido } from '@/types';

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

// ── Clasificar el contenido que viene de Picking ─────────────────────────────────────────────
//
// Existe por un bug que llevaba meses ensuciando el registro: un pallet de chocolate se agregaba
// bien en el formulario (tipo CH) pero, una vez agregado, aparecía como HOGAR.
//
// La causa: al crear el chocolate desde Bodega se escribía `contenido: 'hogar'` en picking_pallets
// —y el mismo 'Hogar' en el item y en la fila del formulario—, mientras que el clasificador que lo
// lee de vuelta mapea "lo que contenga 'chocolate'" a Chocolate. Se guardaba una cosa y se esperaba
// otra. Como el contenido termina en la columna CARGA de la planilla, el chocolate quedaba
// contabilizado como Hogar: 100% mal en junio, 62% en julio, 4% en agosto y todavía 9% en
// septiembre — los caminos normales se habían arreglado, el de agregar a mano no.
//
// El clasificador vivía DUPLICADO en los dos espejos de Bodega con la misma lógica y distinta
// capitalización. Acá queda uno solo; cada espejo pide su formato.

/**
 * El valor que se ESCRIBE en `picking_pallets.contenido` para un chocolate.
 *
 * Tiene que ser algo que `clasificarContenido` reconozca al leerlo de vuelta; si no, el round-trip
 * se rompe en silencio y es exactamente este bug.
 */
export const CONTENIDO_CHOCOLATE = 'chocolate';

export type ClaseContenido = 'comida' | 'hogar' | 'mixto' | 'chocolate';

/**
 * Clasifica el texto libre que viene de Picking.
 *
 * El chocolate se evalúa PRIMERO: un "chocolate hogar" es chocolate, no hogar.
 * "aseo" y "limpieza" cuentan como hogar; "alimento" como comida. Los dos juntos, mixto.
 */
export function clasificarContenido(raw?: string | null): ClaseContenido {
  const c = String(raw ?? '').toLowerCase();
  if (c.includes('chocolate')) return 'chocolate';
  if (c === 'mixto' || c === 'comida-hogar') return 'mixto';
  const comida = c.includes('comida') || c.includes('alimento');
  const hogar  = c.includes('hogar') || c.includes('aseo') || c.includes('limpieza');
  if (comida && hogar) return 'mixto';
  if (comida) return 'comida';
  return 'hogar';
}

const A_SANTIAGO: Record<ClaseContenido, ContenidoSantiago> = {
  comida: 'Comida', hogar: 'Hogar', mixto: 'Mixto', chocolate: 'Chocolate',
};

const A_REGIONES: Record<ClaseContenido, TipoContenido> = {
  comida: 'comida', hogar: 'hogar', mixto: 'comida-hogar', chocolate: 'chocolate',
};

/** Para Bodega RM/Costa, que rotula en mayúscula inicial. */
export function contenidoSantiago(raw?: string | null): ContenidoSantiago {
  return A_SANTIAGO[clasificarContenido(raw)];
}

/** Para Bodega Nacional, que usa los códigos en minúscula ('comida-hogar' en vez de 'mixto'). */
export function contenidoRegiones(raw?: string | null): TipoContenido {
  return A_REGIONES[clasificarContenido(raw)];
}
