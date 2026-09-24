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

// ── Sincronizar la selección entre equipos ───────────────────────────────────────────────────
//
// Reportado: "vehículos que aparecen y desaparecen". Son dos cosas distintas y las dos viven acá.
//
// **1. La selección se pisaba.** El canal de tiempo real REEMPLAZABA la selección entera con la
// del otro equipo, y al tocar un camión se empujaba el conjunto completo. Con dos personas
// eligiendo camiones, gana el último que escribe y al otro se le mueve la flota debajo de las
// manos. Es exactamente el mismo bug que `tableroSync` ya resolvió para las tiendas, y se arregla
// igual: merge de tres vías, acá con la PATENTE como clave.
//
// **2. El parpadeo al abrir.** `selSeco` arranca en `null` y `visiblesEnTablero` con `undefined`
// muestra TODOS los camiones activos. Cuando llega la selección guardada, la lista cambia sola.
// Cada vez que se abre el Enrutador se ve una flota y un segundo después otra. Por eso se guarda
// una copia local por día: la primera pintada ya sale bien, y el servidor corrige después si hace
// falta — pero desde mucho más cerca.

/**
 * Merge de tres vías de la selección, patente por patente.
 *
 * `base` es lo último que este equipo sincronizó. La regla es la misma de `mergeTablero`:
 *
 *   · no la toqué desde el último sync → manda el remoto (es lo que hizo el otro equipo)
 *   · la cambié yo                     → gana lo mío
 *
 * Así, si un equipo agrega un camión y el otro saca otro distinto, quedan los dos cambios. Antes
 * ganaba el último en escribir y el otro perdía su elección sin enterarse.
 */
export function mergeSeleccion(
  remoto: ReadonlySet<string>, local: ReadonlySet<string>, base: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  for (const p of new Set([...remoto, ...local, ...base])) {
    const enLocal = local.has(p), enBase = base.has(p);
    if (enLocal === enBase) { if (remoto.has(p)) out.add(p); continue; }  // no la toqué → remoto
    if (enLocal) out.add(p);                                             // la cambié yo → la mía
  }
  return out;
}

/** ¿Los dos conjuntos tienen las mismas patentes? (para saber si hace falta escribir). */
export function mismaSeleccion(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const p of a) if (!b.has(p)) return false;
  return true;
}

/** Texto estable de una selección: sirve de corta-ecos (el push propio vuelve por el canal). */
export function firmaSeleccion(s: ReadonlySet<string>): string {
  return [...s].sort().join(',');
}

/**
 * Clave de la copia local, POR DÍA.
 *
 * Con la fecha adentro, abrir otro día no hereda la selección del anterior: sin copia se cae al
 * comportamiento de siempre, que es lo correcto para un día que no se trabajó todavía.
 */
export function claveCacheSeleccion(tablero: Tablero, fecha: string): string {
  return `flota_sel:${tablero}:${fecha}`;
}

type AlmacenSimple = Pick<Storage, 'getItem' | 'setItem'>;

function almacenPorDefecto(): AlmacenSimple | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

/** La selección guardada en este equipo para ese día, o `null` si no hay (o si no se puede leer). */
export function leerCacheSeleccion(
  tablero: Tablero, fecha: string, store: AlmacenSimple | null = almacenPorDefecto(),
): Set<string> | null {
  try {
    const raw = store?.getItem(claveCacheSeleccion(tablero, fecha));
    if (!raw) return null;
    return parseSeleccion(JSON.parse(raw));
  } catch { return null; }
}

/** Guarda la selección de este equipo. Que falle no rompe nada: es solo para la primera pintada. */
export function guardarCacheSeleccion(
  tablero: Tablero, fecha: string, sel: ReadonlySet<string>,
  store: AlmacenSimple | null = almacenPorDefecto(),
): void {
  try { store?.setItem(claveCacheSeleccion(tablero, fecha), JSON.stringify(serializarSeleccion(sel))); } catch { /* sin copia local; el servidor manda igual */ }
}
