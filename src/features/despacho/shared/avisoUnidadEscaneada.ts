// Al escanear una etiqueta: decir si esa unidad YA está pesada, antes de volver a pesarla.
// Puro y testeable.
//
// Es la señal que faltaba en el punto exacto donde sirve. La medición del 17/09 encontró que entre
// el 14% y el 23% de las unidades de una jornada se pesan DOS veces: una persona carga un bulto y
// otra, desde otro equipo, lo vuelve a cargar porque no tenía forma de saber que ya estaba hecho.
// `fusionarConPrevio` evita que se duplique el ítem —el conteo no se rompe— pero el trabajo físico
// ya se hizo dos veces: abrir, subir a la balanza, teclear.
//
// El buscador es el mejor lugar para decirlo: con la pistola, escanear la etiqueta es el primer
// gesto de pesar algo. Si el aviso aparece ahí, aparece ANTES del trabajo, no después.
//
// ── Avisa, no bloquea ──────────────────────────────────────────────────────────────────────────
//
// Volver a una unidad ya pesada es legítimo: corregir un peso mal tecleado, revisar medidas. Por
// eso el botón sigue llevando a la tienda igual. Es el mismo criterio que usa el apagado de un
// camión con carga: se dice lo que cuesta, no se impide.

import { esSinPesar } from './sinPesar';

/** Lo mínimo que hace falta de un ítem de Bodega para saber si ya se pesó. */
export interface ItemPesado {
  peso?: number | null;
}

export type EstadoUnidad =
  /** Nadie la cargó todavía en Bodega. Es el caso normal y no se avisa nada. */
  | 'sin-cargar'
  /** Está cargada, pero se guardó con "Agregar sin pesar": falta el peso de verdad. */
  | 'sin-pesar'
  /** Ya tiene un peso real. Volver a pesarla es rehacer trabajo. */
  | 'pesada';

export interface AvisoUnidad {
  estado: EstadoUnidad;
  /** El peso guardado, solo cuando es real. */
  peso: number | null;
  /** Texto para la tarjeta del buscador. `null` = no hay nada que decir. */
  texto: string | null;
  /** `true` solo para 'pesada': es lo único que merece color de advertencia. */
  advertir: boolean;
}

/**
 * Formatea kilos como los escribe la gente: `17 kg`, `20,5 kg`.
 *
 * Coma decimal, que es la de Chile, y sin decimales cuando son cero — `17,0 kg` se lee como una
 * precisión que el dato no tiene.
 */
export function kg(peso: number): string {
  const redondeado = Math.round(peso * 10) / 10;
  return `${String(redondeado).replace('.', ',')} kg`;
}

/**
 * Qué decir de la unidad recién escaneada.
 *
 * Recibe el ítem de Bodega de ESA unidad (el que devuelve `itemDeLaUnidad`), o nada si no existe.
 *
 * "Sin pesar" no se pinta como advertencia a propósito: es el estado normal de algo que está por
 * pesarse, y si todo lo pendiente gritara, el grito dejaría de significar algo justo cuando
 * aparezca el caso que importa.
 */
export function avisoDeUnidad(item?: ItemPesado | null): AvisoUnidad {
  if (!item) return { estado: 'sin-cargar', peso: null, texto: null, advertir: false };
  if (esSinPesar(item)) {
    return { estado: 'sin-pesar', peso: null, texto: 'Agregado sin pesar', advertir: false };
  }
  const peso = item.peso as number;
  return { estado: 'pesada', peso, texto: `Ya pesado · ${kg(peso)}`, advertir: true };
}
