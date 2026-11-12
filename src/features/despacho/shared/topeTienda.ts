/**
 * El TOPE DE RECEPCIÓN de una tienda: cuántos pallets aguanta recibir de una vez.
 *
 * Hay locales donde el muelle, el ascensor o la bodega no dan para más de tres o cuatro. El
 * coordinador tenía ese número en una lista impresa; esto lo trae a la pantalla donde se decide.
 *
 * ── QUÉ ES Y QUÉ NO ES ─────────────────────────────────────────────────────────────────────────
 *
 * Palabras del coordinador (11/11/2026): «Es una señal para saber que se está excediendo la
 * capacidad de la tienda, el que se pueda unificar lo deciden viendo esta información.»
 *
 * De ahí salen las dos reglas que mandan sobre todo lo demás:
 *   1. El texto dice el HECHO («5 de máx 4»), nunca la orden («hay que unificar»). Unificar o no
 *      es una decisión de la persona, tomada mirando el dato.
 *   2. No bloquea nada. Hay días en que el quinto pallet sale igual, y el sistema no es quien
 *      decide eso. Por eso acá no hay ninguna función que devuelva «no se puede».
 *
 * ── QUÉ OCUPA PISO ─────────────────────────────────────────────────────────────────────────────
 *
 * Pallets y CONTENEDORES. No es criterio nuevo: es la regla que ya rige en todo el enrutamiento,
 * fijada con tests en `poolDespacho`, `conteoFlota`, `backlogSegundaVuelta` y
 * `enrutadorIncremental`. Ver `rutas/utils/historialTiendas.ts`: «Un contenedor ocupa piso como un
 * pallet → cuenta para `techoPallets`. Bultos y chocolates no.»
 *
 * Los bultos y los chocolates no suman. Una tienda con dos pallets y nueve bultos está DENTRO de
 * un tope de tres: los bultos van arriba del pallet o al costado, no ocupan una posición propia.
 *
 * ── QUÉ SE CUENTA ──────────────────────────────────────────────────────────────────────────────
 *
 * Lo GUARDADO en Bodega, no lo que imprimió Picking (regla de `CLAUDE.md`). El aviso aparece
 * cuando el quinto pallet está pesado y guardado, no cuando hay cinco etiquetas impresas: una
 * etiqueta se unifica con otra y nunca llega a ser una posición en el camión.
 *
 * Puro y sin React: recibe números, devuelve estado y texto.
 */

export type EstadoTope = 'sin-tope' | 'dentro' | 'al-tope' | 'excedido';

export interface UnidadesDeTienda {
  pallet: number;
  contenedor: number;
}

/** Un número que sirva para contar: lo que no es finito o es negativo vale 0. */
function sano(n: unknown): number {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Las posiciones de piso que ocupa la tienda: pallets + contenedores.
 * Bultos y chocolates no entran a propósito — ver la cabecera.
 */
export function pisoOcupado(u: Partial<UnidadesDeTienda> | null | undefined): number {
  return sano(u?.pallet) + sano(u?.contenedor);
}

/**
 * `null`/`undefined` es «sin tope», que es un estado REAL y no un cero. Contado en la base el
 * 12/11/2026, de 66 tiendas activas **35 tienen tope y 31 no**: 23 de Región, los cinco puntos
 * más la oficina, y tres sueltas que la lista del coordinador no trae (`35BN2`, `62PLD`,
 * `63CAL`). Si el nulo se leyera como 0, esas 31 quedarían excedidas desde el primer pallet.
 */
export function estadoTope(piso: number, tope: number | null | undefined): EstadoTope {
  if (tope == null || !Number.isFinite(Number(tope))) return 'sin-tope';
  const t = Math.floor(Number(tope));
  const p = sano(piso);
  if (p > t) return 'excedido';
  if (p === t) return 'al-tope';
  return 'dentro';
}

/**
 * Lo que dice el chip.
 *
 * Dentro del tope dice «máx 5» y no «3 de máx 5»: el 3 ya está dos renglones más abajo, en el
 * conteo por tipo de la misma fila, y en el teléfono el ancho es escaso. En los otros dos estados
 * el número SÍ va, porque ahí la comparación es justamente el dato.
 */
export function textoTope(piso: number, tope: number | null | undefined): string {
  const estado = estadoTope(piso, tope);
  if (estado === 'sin-tope') return '';
  const t = Math.floor(Number(tope));
  return estado === 'dentro' ? `máx ${t}` : `${sano(piso)} de máx ${t}`;
}

/** Para el `title` del chip y el lector de pantalla: el estado dicho en palabras. */
export function tituloTope(piso: number, tope: number | null | undefined): string {
  switch (estadoTope(piso, tope)) {
    case 'excedido': return 'Se pasó del tope de recepción de la tienda';
    case 'al-tope':  return 'Justo en el tope de recepción de la tienda';
    case 'dentro':   return 'Tope de recepción de la tienda';
    default:         return '';
  }
}
