// Qué camiones usa CADA tablero. Puro y testeable.
//
// Había un solo interruptor por camión: `flota_vehiculos.en_servicio`, una columna sin tablero, sin
// día y sin usuario. Los dos tableros —DESPACHO (seco) y CONGELADOS— leían el mismo valor, así que
// apagar los 5 de Luis Fica para trabajar congelados los apagaba también en despacho, para todos,
// y seguía apagado al día siguiente.
//
// `en_servicio` NO significa "el camión funciona". La aplicación nunca usó esas palabras: dice
// "CAMIONES ACTIVOS", "8 activos · 23 en total", "toca para activar / desactivar". Significa
// **lo estoy usando**. El nombre de la columna engaña, y los datos lo confirman: 15 de 23 en
// `false` — dos tercios de la flota rota no existe; dos tercios sin usar hoy es lo normal.
//
// Eso importa porque de la primera lectura salió un diseño equivocado: se trató `en_servicio` como
// un candado global de "¿está operativo?" y se le puso ENCIMA una capa de selección por tablero.
// Quedaron dos capas para algo que necesita una, y la de abajo —la compartida— seguía bloqueando
// a la de arriba: un camión sin usar quedaba tachado e intocable en los dos tableros.
//
// Acá hay UNA sola capa, por tablero. La selección del tablero ES el "lo estoy usando" de siempre,
// y `en_servicio` queda solo como SEMILLA del primer día. No hay nada que desbloquear.
//
// Un concepto de "fuera de servicio / en mantención" NO existe en el sistema —ni columna ni
// pantalla— y no se inventa acá. Cuando haga falta, se diseña a partir de qué decisión se toma
// con ese dato.

import type { Vehiculo } from '../data/flota';

/** La empresa propia. Congelados se mueve con ella (flota interna). */
export const EMPRESA_INTERNA = 'Kios Club';

export type Tablero = 'seco' | 'congelados';

const norm = (s?: string | null) => String(s ?? '').trim().toLowerCase();

/** ¿Es un camión de la flota propia? */
export function esFlotaInterna(empresa?: string | null): boolean {
  return norm(empresa) === norm(EMPRESA_INTERNA);
}

/**
 * Con qué camiones arranca un tablero cuando todavía no se eligió nada ese día.
 *
 * Congelados toma la flota interna y el seco las externas — que es como se trabaja hoy. NO es una
 * regla rígida: es solo el punto de partida, y se cambia con un toque. Sin esto habría que
 * configurar los dos tableros cada mañana antes de poder hacer nada.
 *
 * Arranca de los que ya estaban activos (`v.on`): es el conjunto que se venía usando, así que el
 * primer día no cambia nada de lo que ya estaba a la vista.
 */
export function seleccionInicial(flota: Vehiculo[], tablero: Tablero): string[] {
  return flota
    .filter(v => v.on && (tablero === 'congelados' ? esFlotaInterna(v.empresa) : !esFlotaInterna(v.empresa)))
    .map(v => v.p);
}

/**
 * Los camiones que ve un tablero.
 *
 * `seleccion` undefined = todavía no cargó, o un tablero que no la usa: se comporta como antes y
 * muestra los activos. Que la falta de dato esconda camiones sería peor que el bug que se arregla.
 */
export function visiblesEnTablero(flota: Vehiculo[], seleccion?: ReadonlySet<string>): Vehiculo[] {
  // Con selección, ELLA manda: es el "lo estoy usando" de este tablero y no hay nada por encima.
  // Sin selección (todavía no cargó, o un tablero que no la usa) se cae al `on` de siempre.
  return seleccion ? flota.filter(v => seleccion.has(v.p)) : flota.filter(v => v.on);
}

/** Agrega o saca un camión de la selección de un tablero. */
export function alternar(seleccion: ReadonlySet<string>, patente: string): Set<string> {
  const next = new Set(seleccion);
  if (next.has(patente)) next.delete(patente); else next.add(patente);
  return next;
}

/** Serializa para `shared_session_state` (orden estable: el diff no cambia por reordenar). */
export function serializarSeleccion(s: ReadonlySet<string>): { patentes: string[] } {
  return { patentes: [...s].sort() };
}

/** Lee lo guardado. `null` cuando nunca se guardó — ahí manda `seleccionInicial`. */
export function parseSeleccion(estado: unknown): Set<string> | null {
  const p = (estado as { patentes?: unknown } | null)?.patentes;
  if (!Array.isArray(p)) return null;
  return new Set(p.filter((x): x is string => typeof x === 'string' && x.trim() !== ''));
}
