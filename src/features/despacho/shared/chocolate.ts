// El chocolate (CH): medidas fijas y de dónde sale su peso.
//
// Dos cosas que arregla este módulo.
//
// 1) LA TRIPLICACIÓN. Las mismas medidas estaban escritas en tres lugares —`StepForm` (RM/Costa),
//    `regiones/data/tiendas.ts` y otra vez en `TiendasPage` como `CHOCOLATE_DIMS_R`, esta última
//    encima con los campos en otro orden— y el peso por defecto en dos. Cambiar la caja obligaba
//    a acordarse de los cinco sitios.
//
// 2) EL PESO INVENTADO. Al materializar un chocolate que viene de Picking, Bodega le ponía
//    `CHOCOLATE_DEFAULT_PESO` SIEMPRE, aunque el slot trajera el peso real. O sea que quien pesó
//    el bulto en Picking veía sus 18 kg convertidos en 20 al llegar a Bodega.
//
//    Que hoy los datos no lo noten no lo hace inofensivo: en producción los 549 chocolates del
//    último mes tienen UN SOLO valor de alto (42) y peso siempre 20,0 — porque nadie podía escribir
//    otro, no porque todos pesen igual. El PR anterior abrió el camino para que el peso viaje; este
//    hace que Bodega lo respete.
//
// Puro y testeable: no toca red ni base.

/** Medidas oficiales de la caja de chocolate, en cm. Una sola definición para todo el sistema. */
export const CHOCOLATE_DIMS = { alto: 42, largo: 80, ancho: 56 } as const;

/** Tope de seguridad de la caja, en kg. */
export const CHOCOLATE_PESO_MAX = 25;

/**
 * Peso a usar cuando nadie lo pesó.
 *
 * No es un promedio ni una medición: es la constante que se viene escribiendo desde siempre. Se
 * mantiene como respaldo para que un chocolate sin pesar siga comportándose como ayer.
 */
export const CHOCOLATE_PESO_DEFECTO = 20;

/** Lo mínimo que hace falta saber de un slot para sacarle el peso. */
interface SlotConPeso { peso_kg?: number | null }

/**
 * El peso de un chocolate: el que trae el slot de Picking si alguien lo pesó, y si no el de
 * siempre.
 *
 * El `0` cuenta como "sin pesar" y NO como cero kilos — misma lectura que `sinPesar.ts` y que
 * `medidasPallet.ts`. Una balanza en cero es una balanza que nadie usó.
 */
export function pesoChocolate(slot?: SlotConPeso | null): number {
  const p = slot?.peso_kg;
  if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0) return CHOCOLATE_PESO_DEFECTO;
  return p;
}

/** Las medidas del chocolate, como objeto nuevo — así nadie muta la constante compartida. */
export function dimsChocolate(): { alto: number; largo: number; ancho: number } {
  return { ...CHOCOLATE_DIMS };
}

/**
 * ¿Es un peso aceptable para un chocolate?
 *
 * Se RECHAZA, no se recorta en silencio: si alguien escribió 30, lo más probable es que se haya
 * equivocado de casilla o de unidad, y guardarle un 25 sin avisar convierte un error visible en
 * un dato falso que nadie va a volver a revisar.
 */
export function pesoChocolateValido(v: unknown): { ok: true; peso: number } | { ok: false; error: string } {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: 'Escribe el peso en kg (ej. 18,5).' };
  }
  if (n > CHOCOLATE_PESO_MAX) {
    return { ok: false, error: `El chocolate no puede pesar más de ${CHOCOLATE_PESO_MAX} kg. ¿Escribiste el peso correcto?` };
  }
  return { ok: true, peso: n };
}
