// Cerrar un camión que va pasado de capacidad. Puro y testeable.
//
// La capacidad de la flota es una referencia, no una ley física. Un pallet chico se sube encima de
// otro y entra; para regiones se achican o se desconsolidan algunos para que quepan. No es lo ideal
// y nadie dice que lo sea, pero pasa, y cuando pasa el camión SALE igual.
//
// El tablero lo trataba como un error: el botón de cerrar quedaba deshabilitado y no había forma de
// registrar el camión. El despacho quedaba trabado por un número que ya había sido superado en el
// andén — con el camión cargado y esperando.
//
// La decisión: se avisa, no se bloquea. Quien está en el andén ve el camión; el sistema no.
//
// DOS COSAS QUE NO CAMBIAN, a propósito:
//
//   · El conteo. Si se cargaron 12 pallets, el registro y el manifiesto dicen 12. La capacidad no
//     recorta nada: sería mentir sobre lo que va arriba del camión.
//   · El motor. `enrutadorV2` decide con su propia regla (`v.c >= grupo.p`) y no mira esto: sigue
//     sin PROPONER un camión pasado por su cuenta. Lo que se habilita es la excepción manual, que
//     es una decisión de persona, no del algoritmo.

export interface ExcesoCapacidad {
  /** Pallets cargados. */
  pallets: number;
  /** Capacidad nominal del vehículo. */
  capacidad: number;
  /** Cuántos van de más. Siempre ≥ 1 cuando hay exceso. */
  sobran: number;
}

/** El exceso de un camión, o `null` si cabe. */
export function excesoDe(pallets: number, capacidad: number): ExcesoCapacidad | null {
  const p = Number(pallets) || 0;
  const c = Number(capacidad) || 0;
  if (c <= 0 || p <= c) return null;
  return { pallets: p, capacidad: c, sobran: p - c };
}

/**
 * Lo que se pregunta antes de cerrar un camión pasado.
 *
 * Dice los números reales y deja claro que el conteo NO se toca: la duda de quien cierra es
 * justamente si el sistema le va a "arreglar" la cifra por su cuenta.
 */
export function confirmacionSobreCapacidad(patente: string, e: ExcesoCapacidad): string {
  const p = e.sobran === 1 ? 'pallet' : 'pallets';
  return `${patente} lleva ${e.pallets} pallets y su capacidad es ${e.capacidad}: ${e.sobran} ${p} de más.\n\n`
    + `Se registra tal cual: el manifiesto y el conteo van a decir ${e.pallets}.\n\n`
    + '¿Cerrar el camión igual?';
}

/**
 * Lo que se pregunta antes de ASIGNAR carga que deja al camión pasado.
 *
 * Hasta ahora este camino era el único que seguía bloqueando: el tablero cortaba con un aviso y no
 * dejaba soltar la tienda. La salida que quedaba era ir a Flota y subirle la capacidad al vehículo
 * —de 12 a 13 pallets—, que arregla el día de hoy y le miente al motor para SIEMPRE: `enrutadorV2`
 * decide con `v.c >= grupo.p`, así que ese camión queda proponiéndose para 13 todos los días.
 *
 * Por eso la pregunta es acá y no en Flota: la excepción es de hoy y de este camión.
 */
export function confirmacionCargaSobreCapacidad(patente: string, e: ExcesoCapacidad): string {
  const p = e.sobran === 1 ? 'pallet' : 'pallets';
  return `${patente} quedaría con ${e.pallets} pallets y su capacidad es ${e.capacidad}: ${e.sobran} ${p} de más.\n\n`
    + `Se asigna tal cual: el manifiesto y el conteo van a decir ${e.pallets}.\n\n`
    + '¿Asignar igual?';
}

/** Texto del botón. Cuando hay exceso lo dice, para que cerrar no parezca la vía normal. */
export function textoBotonCerrar(hayExceso: boolean): string {
  return hayExceso ? '⚠ Cerrar igual (sobre capacidad)' : '🚚 Cerrar camión y manifiesto';
}

/** Un camión de la selección, con su exceso ya calculado. */
export interface CamionConExceso { patente: string; exceso: ExcesoCapacidad }

/**
 * Lo que se pregunta al cerrar VARIOS de una, cuando alguno va pasado.
 *
 * Se nombran uno por uno: "2 camiones sobre capacidad" no alcanza para decidir — hay que saber
 * CUÁLES, porque el criterio cambia según el camión y quién lo cargó.
 */
export function confirmacionVarios(conExceso: CamionConExceso[]): string {
  const lineas = conExceso.map(c => `  · ${c.patente}: ${c.exceso.pallets} de ${c.exceso.capacidad} (${c.exceso.sobran} de más)`);
  const n = conExceso.length;
  return `${n === 1 ? 'Un camión va' : `${n} camiones van`} sobre capacidad:\n\n${lineas.join('\n')}\n\n`
    + 'Se registran tal cual, con los pallets que llevan.\n\n'
    + `¿Cerrar ${n === 1 ? 'igual' : 'todos igual'}?`;
}
