// Qué camiones usa CADA tablero. Puro y testeable.
//
// Había un solo interruptor por camión: `flota_vehiculos.en_servicio`, una columna sin tablero, sin
// día y sin usuario. Los dos tableros —DESPACHO (seco) y CONGELADOS— leían el mismo valor, así que
// apagar los 5 de Luis Fica para trabajar congelados los apagaba también en despacho, para todos,
// y seguía apagado al día siguiente.
//
// El problema es que ahí se mezclaban DOS cosas distintas:
//
//   EN SERVICIO      El camión existe y funciona. Se apaga cuando se rompe, está en mantención o
//                    no vino el conductor. Esto SÍ es global: un camión roto está roto para los
//                    dos tableros. Es lo que ya hace `en_servicio`, y se queda como está.
//
//   EN ESTE TABLERO  Cuál de los que funcionan estoy usando ACÁ. Congelados va con flota interna;
//                    el seco con las empresas externas. Esto es lo que faltaba.
//
// Un camión aparece en un tablero cuando cumple las dos.

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
 * Solo entran los que están EN SERVICIO: preseleccionar un camión roto sería empezar el día con
 * una mentira.
 */
export function seleccionInicial(flota: Vehiculo[], tablero: Tablero): string[] {
  return flota
    .filter(v => v.on && (tablero === 'congelados' ? esFlotaInterna(v.empresa) : !esFlotaInterna(v.empresa)))
    .map(v => v.p);
}

/**
 * Los camiones que ve un tablero: en servicio Y elegidos acá.
 *
 * `seleccion` undefined = sin selección todavía (tableros que no la usan, o antes de que cargue):
 * se comporta como antes y muestra todos los que están en servicio. Que la falta de dato esconda
 * camiones sería peor que el bug que se está arreglando.
 */
export function visiblesEnTablero(flota: Vehiculo[], seleccion?: ReadonlySet<string>): Vehiculo[] {
  return flota.filter(v => v.on && (!seleccion || seleccion.has(v.p)));
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
