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

/** Abreviatura para el botón y la línea pesada: «Com», o «Com · Hog · Ase» en una mezcla. */
export function abreviaturaContenido(t: string): string {
  const c = clasificarContenido(t);
  if (c === 'chocolate') return 'Cho';
  return componentesDe(c).map(k => ABREV[k]).join(' · ');
}

/** Nombre completo: «Comida», o «Comida · Hogar · Aseo» en una mezcla. */
export function nombreContenido(t: string): string {
  const c = clasificarContenido(t);
  if (c === 'chocolate') return 'Chocolate';
  return componentesDe(c).map(k => NOMBRE[k]).join(' · ');
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

/**
 * Los ocho tipos de carga. Desde el 13/10/2026 son los mismos que marca Picking al imprimir
 * (`categoriesToContenido`): aseo dejó de contarse como hogar y las mezclas se distinguen.
 * 'comida-hogar' es lo que Picking llama 'mixto' y RM/Costa sigue escribiendo 'Mixto'.
 */
export type ClaseContenido =
  | 'comida' | 'hogar' | 'aseo' | 'chocolate'
  | 'comida-hogar' | 'comida-aseo' | 'hogar-aseo' | 'comida-hogar-aseo';

/** Los que se ven como botón. */
export const TIPOS_SIMPLES = ['comida', 'hogar', 'aseo', 'chocolate'] as const satisfies readonly ClaseContenido[];
/** Los que se abren con «⋯», en este orden. */
export const TIPOS_MEZCLA = ['comida-hogar-aseo', 'comida-aseo', 'comida-hogar', 'hogar-aseo'] as const satisfies readonly ClaseContenido[];

export type ComponenteCarga = 'comida' | 'hogar' | 'aseo';
const ABREV: Record<ComponenteCarga, string> = { comida: 'Com', hogar: 'Hog', aseo: 'Ase' };
const NOMBRE: Record<ComponenteCarga, string> = { comida: 'Comida', hogar: 'Hogar', aseo: 'Aseo' };

/** De qué está hecho un tipo (el chocolate no se mezcla: lista vacía). Da los puntos de color. */
export function componentesDe(c: ClaseContenido): ComponenteCarga[] {
  if (c === 'chocolate') return [];
  return (['comida', 'hogar', 'aseo'] as const).filter(k => c.split('-').includes(k));
}

export function esMezcla(c: ClaseContenido): boolean {
  return componentesDe(c).length > 1;
}

/**
 * Clasifica el texto que venga: lo que escribe Picking ('completo', 'aseo-hogar', 'mixto'…), lo
 * que guarda Nacional ('comida-hogar') o RM/Costa ('Mixto', 'Comida-Aseo'), o texto libre.
 *
 * El chocolate se evalúa PRIMERO: un "chocolate hogar" es chocolate, no hogar. «limpieza» cuenta
 * como aseo y «alimento» como comida. Sin nada reconocible cae en hogar, el default histórico.
 */
export function clasificarContenido(raw?: string | null): ClaseContenido {
  const c = String(raw ?? '').toLowerCase();
  if (c.includes('chocolate')) return 'chocolate';
  if (c === 'mixto') return 'comida-hogar';
  if (c === 'completo') return 'comida-hogar-aseo';
  const tiene = {
    comida: c.includes('comida') || c.includes('alimento'),
    hogar:  c.includes('hogar'),
    aseo:   c.includes('aseo') || c.includes('limpieza'),
  };
  const partes = (['comida', 'hogar', 'aseo'] as const).filter(k => tiene[k]);
  if (partes.length === 0) return 'hogar';
  return partes.join('-') as ClaseContenido;
}

const A_SANTIAGO: Record<ClaseContenido, ContenidoSantiago> = {
  comida: 'Comida', hogar: 'Hogar', aseo: 'Aseo', chocolate: 'Chocolate',
  'comida-hogar': 'Mixto', 'comida-aseo': 'Comida-Aseo', 'hogar-aseo': 'Hogar-Aseo',
  'comida-hogar-aseo': 'Comida-Hogar-Aseo',
};

/** Para Bodega RM/Costa, que rotula en mayúscula inicial ('Mixto' es comida y hogar). */
export function contenidoSantiago(raw?: string | null): ContenidoSantiago {
  return A_SANTIAGO[clasificarContenido(raw)];
}

/** Para Bodega Nacional, que guarda el código en minúscula ('comida-hogar' en vez de 'mixto'). */
export function contenidoRegiones(raw?: string | null): TipoContenido {
  return clasificarContenido(raw);
}

/**
 * ¿El tipo de carga de esta unidad lo marcó Picking? Entonces se muestra bloqueado: lo decidió
 * quien armó el pallet y lo imprimió en la etiqueta. Los slots creados en Bodega llevan
 * `picker_label = 'Bodega'` (fn_create_bodega_slot); sin slot tampoco hay de dónde sacarlo.
 */
export function tipoDesdePicking(slot?: { picker_label?: string | null } | null): boolean {
  return !!slot && !!slot.picker_label && slot.picker_label !== 'Bodega';
}

/**
 * El tipo que queda al unir dos unidades: lo que traían las dos. Comida + Aseo = Comida · Aseo.
 * El chocolate no entra en una mezcla: si las dos son chocolate sigue siéndolo, y si solo una lo
 * es manda la otra. Antes cualquier diferencia daba «Mixto» (comida y hogar) aunque no hubiera hogar.
 */
export function unirTipos(a: string, b: string): ClaseContenido {
  const ca = clasificarContenido(a), cb = clasificarContenido(b);
  const partes = new Set([...componentesDe(ca), ...componentesDe(cb)]);
  if (partes.size === 0) return 'chocolate';
  return (['comida', 'hogar', 'aseo'] as const).filter(k => partes.has(k)).join('-') as ClaseContenido;
}

/** Lo que va en la columna CARGA de la planilla. Un pallet web va sin categoría (Isaias, 13/10). */
export function cargaParaPlanilla(t: string, palletWeb?: boolean | null): string {
  if (palletWeb) return '';
  const c = clasificarContenido(t);
  if (c === 'chocolate') return 'Chocolate';
  return componentesDe(c).map(k => NOMBRE[k]).join('-');
}
