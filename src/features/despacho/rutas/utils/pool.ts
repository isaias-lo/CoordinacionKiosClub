// Qué tiendas forman el pool del día. UNA definición, usada por todos.
//
// Antes esta pregunta se contestaba con un `if` escrito a mano en cada lugar que la necesitaba, y
// las copias se fueron separando. Sobre los CUATRO tipos de carga (pallets, bultos, contenedores y
// chocolates) había cinco variantes distintas conviviendo:
//
//   incluían todo → poolDesdeCalT · tiendasArmadasSinRutear
//   sin contenedores → el disparador de auto-asignación, el indicador de fase, el pool VISIBLE del
//                      tablero, y los pendientes de 2ª vuelta
//   sin contenedores ni chocolates → el contador del header y la fase 3 de mergeCalT
//
// El resultado para una tienda de SOLO contenedores era absurdo y silencioso: no se veía en el
// tablero (no se podía arrastrar), no la contaba el header, no disparaba la auto-asignación y no
// entraba al backlog de 2ª vuelta — pero SÍ se le mandaba al motor. Y una tienda de solo
// chocolates que salía del calendario a mitad de día se descartaba entera, siendo que los
// chocolates son el 31% de lo que sale de bodega.
//
// La regla es una sola y vive acá.

/** Las cuatro cantidades de una tienda. `c` = CONTENEDORES (number), no el código. */
export interface CargaPool { p?: number; b?: number; c?: number; ch?: number }

/** Una entrada del pool del día: su carga + si está en el pool. */
export interface EntradaPool extends CargaPool { on: boolean; g?: string }

/**
 * ¿La tienda tiene algo que despachar? Cualquiera de los cuatro tipos cuenta.
 *
 * Un contenedor ocupa piso como un pallet y un chocolate viaja igual que un bulto: una tienda con
 * solo contenedores o solo chocolates tiene carga real y hay que sacarla igual que a las demás.
 */
export function tieneCarga(d: CargaPool | undefined): boolean {
  if (!d) return false;
  return (d.p ?? 0) > 0 || (d.b ?? 0) > 0 || (d.c ?? 0) > 0 || (d.ch ?? 0) > 0;
}

/**
 * ¿La tienda participa del día? Está en el pool Y tiene carga.
 *
 * `on` significa una sola cosa: la tienda es parte del pool de hoy. NO es el filtro de grupo —
 * filtrar por RM/COSTA/REGIONES cambia qué se ve, nunca qué se despacha.
 */
export function enElPool(d: EntradaPool | undefined): boolean {
  return !!d?.on && tieneCarga(d);
}

/** Códigos del pool del día, ordenados. Base del disparador de auto-asignación y de los conteos. */
export function codsEnPool(calT: Record<string, EntradaPool>): string[] {
  return Object.keys(calT).filter(c => enElPool(calT[c])).sort();
}
