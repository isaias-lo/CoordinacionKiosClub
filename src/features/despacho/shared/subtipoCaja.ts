// De qué caja es un chocolate: negra o de cartón. Puro y testeable.
//
// Hasta el 22/09/2026 el chocolate era UNA cosa: un tipo `CH` con medidas fijas 42 × 80 × 56 y un
// peso por defecto de 20 kg. Las dos suposiciones se cayeron el mismo día — el peso ahora se toma
// en Bodega (#552), y las medidas resultaron ser solo de una de las dos cajas:
//
//   · CAJA NEGRA    mide siempre 42 × 80 × 56. Solo falta pesarla.
//   · CAJA CARTÓN   el tamaño varía mucho. NO se le piden medidas: solo el peso.
//
// Pedirle medidas a una caja de cartón es pedir un dato que nadie puede dar bien, y lo que se
// escribe para salir del paso termina en el cálculo de volumen del camión.
//
// ── Por qué esto es un SUBTIPO y no dos tipos nuevos ───────────────────────────────────────────
//
// Lo natural parecería usar los códigos `CC` y `CN` que ya existen. No se hace, por dos razones y
// la primera es del coordinador:
//
// 1. La numeración tiene que seguir corrida: CH1, CH2, CH3, mezclando las dos cajas.
//    `computePalletNums` numera AGRUPANDO POR TIPO, así que dos tipos distintos darían CN1, CN2 y
//    CC1 por separado. Con un solo tipo, la numeración que se pidió sale sola.
//
// 2. `CC` y `CN` ya significan CONGELADOS en ocho lugares del sistema — `encargadoManual.ts:40`
//    los manda a esa sección sin preguntar, `tiposUnidad.ts:43` los bloquea en seco, y ni
//    `SANT_TIPO` ni los cuatro mapas de `TiendasPage` los conocen: un tipo que no está en el mapa
//    no falla, cae a `'Pallet'` EN SILENCIO. Reusar esos códigos para otra cosa deja a los dos
//    flujos separados por un solo campo de texto.
//
// Así que el tipo sigue siendo `CH` y la caja viaja aparte, en `picking_pallets.subtipo`.
//
// ── Lo que ya estaba guardado ──────────────────────────────────────────────────────────────────
//
// Los chocolates anteriores al cambio no tienen subtipo. Se leen como NEGRA, porque es lo que
// describen: todos recibieron las medidas 42 × 80 × 56. Así nada viejo cambia de comportamiento.

export const SUBTIPOS_CAJA = ['negra', 'carton'] as const;
export type SubtipoCaja = typeof SUBTIPOS_CAJA[number];

/** Las medidas de la caja negra, en cm. Las únicas fijas que hay. */
export const MEDIDAS_CAJA_NEGRA = { alto: 42, largo: 80, ancho: 56 } as const;

/**
 * Lee el subtipo guardado. Lo que no se reconoce —incluido el `null` de todo lo anterior al
 * cambio— se lee como NEGRA: es lo que describe a los chocolates que ya existen.
 */
export function subtipoDeCaja(v: unknown): SubtipoCaja {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'carton' || s === 'cartón' ? 'carton' : 'negra';
}

/** El nombre que ve la persona. El de cartón lleva tilde: es una palabra, no un código. */
export function etiquetaSubtipo(s: SubtipoCaja): string {
  return s === 'carton' ? 'Caja Cartón' : 'Caja Negra';
}

/**
 * ¿Se le piden medidas a esta caja?
 *
 * Solo a la negra, y en realidad ni siquiera: ya se saben, se muestran y no se escriben. La de
 * cartón no tiene medidas que pedir, así que el formulario no las muestra en vez de mostrarlas
 * vacías esperando una respuesta que nadie tiene.
 */
export function tieneMedidasFijas(s: SubtipoCaja): boolean {
  return s === 'negra';
}

/** Las medidas que le corresponden, o `null` si esta caja no tiene medidas conocidas. */
export function medidasDeCaja(s: SubtipoCaja): { alto: number; largo: number; ancho: number } | null {
  return tieneMedidasFijas(s) ? { ...MEDIDAS_CAJA_NEGRA } : null;
}

// ── La clave con la que la interfaz cuenta unidades ────────────────────────────────────────────
//
// Los contadores de Picking agrupan POR TIPO, y ahora dos botones —negra y cartón— escriben el
// mismo tipo `CH`. Si contaran por tipo a secas mostrarían el mismo número los dos.
//
// La clave resuelve eso sin tocar nada más: para el chocolate es `CH:negra` / `CH:carton`, y para
// todo lo demás es el tipo pelado, igual que siempre. Así el pallet, el bulto y el contenedor no
// se enteran de que esto existe, y la base sigue guardando `tipo` y `subtipo` por separado.

/** La clave de conteo de una unidad. `CH:negra` para el chocolate; el tipo pelado para el resto. */
export function claveUnidad(tipo: string, subtipo?: unknown): string {
  const t = String(tipo ?? '').trim().toUpperCase();
  return t === 'CH' ? `CH:${subtipoDeCaja(subtipo)}` : t;
}

/** El camino inverso: de la clave al par que entiende la base. */
export function partirClave(clave: string): { tipo: string; subtipo: SubtipoCaja | null } {
  const [tipo, sub] = String(clave ?? '').split(':');
  const t = (tipo ?? '').trim().toUpperCase();
  return t === 'CH' ? { tipo: 'CH', subtipo: subtipoDeCaja(sub) } : { tipo: t, subtipo: null };
}
