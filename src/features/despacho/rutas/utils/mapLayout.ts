// Ancho del panel del mapa en el Enrutador — y, sobre todo, cómo esconderlo sin pagarlo dos veces.
//
// EL PUNTO DE TODO ESTE MÓDULO: esconder el mapa NO puede desmontarlo.
//
// `MapSection` guarda en `lastDrawnRef` la firma de lo último que dibujó, y con eso evita re-llamar
// a Google Directions cuando la ruta a dibujar es idéntica. Directions se factura por llamada. Si
// el panel se desmonta, ese ref se va con él: al volver, la firma está vacía, no coincide con nada
// y se vuelve a llamar a Google por cada ruta en pantalla.
//
// Un botón de mostrar/esconder que se aprieta todo el día pagaría cada vez. Por eso el panel se
// queda SIEMPRE montado y lo que cambia es su ancho: colapsado mide 0 px, sigue en el layout, y el
// `ResizeObserver` de `MapSection` lo re-centra solo al restaurarlo — sin una sola llamada nueva.
//
// De paso esto cierra dos fugas que ya existían antes de que hubiera botón: ir al tab FLOTA
// desmontaba el mapa, y volver re-facturaba Directions. Lo mismo al abrir el drawer en móvil.
//
// Puro y testeable: no toca React, ni el DOM, ni localStorage.

/** Ancho del mapa, en % del ancho total, cuando está visible. */
export const MAP_PCT_DEFAULT = 37;
export const MAP_PCT_MIN = 20;
export const MAP_PCT_MAX = 85;

/**
 * Hasta dónde llega el ARRASTRE. Menos que `MAP_PCT_MAX`, y a propósito.
 *
 * Arrastrar sirve para elegir un ancho de trabajo con las dos cosas a la vista; taparlo entero es
 * otra intención y tiene su propio gesto —un toque—, que además llega más lejos que cualquier
 * arrastre (`calc(100% - 360px)`). Dejar que el arrastre se acerque al máximo hacía que las dos
 * formas compitieran y que uno terminara arrastrando hasta el borde para algo que es un clic.
 *
 * Estaba escrito a mano dentro del arrastre (`Math.min(60, Math.max(20, …))`), con el módulo
 * declarando 85 al lado: dos límites que no conversaban.
 */
export const MAP_PCT_DRAG_MAX = 60;

/** Ancho de la manija, en px. Chica se ve, pero hay que poder AGARRARLA. */
export const MANIJA_PX = 16;
/** El grosor de la línea que se ve. El resto de la manija es área de agarre transparente. */
export const MANIJA_LINEA_PX = 6;

/**
 * Cuánto tarda la cortina en correrse.
 *
 * Sin transición el panel SALTA de un ancho a otro, que no se lee como una cortina sino como un
 * error de dibujo. Es corto a propósito: el gesto tiene que sentirse inmediato.
 *
 * No se anima MIENTRAS se arrastra — ahí el ancho tiene que seguir al dedo sin ir un cuadro atrás.
 *
 * Animar es gratis en llamadas a Google: el `ResizeObserver` de `MapSection` solo dispara el evento
 * `resize` del mapa y lo re-centra, y ya viene limitado por `requestAnimationFrame`. Lo que sí
 * costaría es DESMONTAR el panel, que es de lo que trata todo este módulo.
 */
export const CORTINA_MS = 180;

/** El ancho del arrastre, saneado contra los límites del arrastre (no los del panel). */
export function clampArrastre(pct: number): number {
  return Math.min(MAP_PCT_DRAG_MAX, Math.max(MAP_PCT_MIN, pct));
}

/**
 * Ancho de la columna de tiendas, en px. Es el MISMO número que usa la grilla del tablero
 * (`lg:grid-cols-[minmax(0,360px)_...]`). La cortina "entera" tapa todo menos esa columna: cubre la
 * flota, que es lo que estorba mirando el mapa, y deja las tiendas a la vista para poder seguir
 * arrastrando desde ahí.
 */
export const ANCHO_TIENDAS_PX = 360;

export const LS_MAP_PCT = 'enrutador_map_w_pct';
export const LS_MAP_OCULTO = 'enrutador_map_oculto';

/**
 * El % guardado, saneado. Cualquier cosa que no sea un número dentro del rango —vacío, texto,
 * `null`, un número absurdo de una versión vieja— vuelve al valor por defecto en vez de romper
 * el layout.
 */
export function clampMapPct(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  if (!Number.isFinite(n)) return MAP_PCT_DEFAULT;
  if (n < MAP_PCT_MIN || n > MAP_PCT_MAX) return MAP_PCT_DEFAULT;
  return n;
}

/**
 * ¿El mapa va colapsado?
 *
 * Dos motivos distintos que terminan igual: el tab FLOTA no tiene mapa que mostrar, y el
 * coordinador puede haberlo escondido a mano. `hayMapa` es lo único que decide si el panel
 * existe siquiera — cuando el padre no pasa mapa, no hay nada que colapsar ni que mostrar.
 */
export function mapaColapsado(opts: { modo: string; oculto: boolean }): boolean {
  return opts.modo === 'flota' || opts.oculto === true;
}

/**
 * Ancho de la CORTINA del mapa, superpuesta sobre la columna de flota.
 *
 * El mapa dejó de ser una tercera columna que empuja el contenido: ahora lo TAPA. El pedido fue
 * explícito —"que sea una tipo cortina que ocupe toda la columna derecha"— y la razón es de uso:
 * empujando, abrir el mapa reacomodaba las tarjetas de camión y había que volver a buscar dónde
 * quedó cada una. Tapando, lo de abajo no se mueve; se corre la cortina y sigue todo en su lugar.
 *
 * Devuelve un ancho en %, no un `flex`: la cortina se posiciona absoluta sobre la fila, así que su
 * tamaño ya no se negocia con nadie.
 *
 * Colapsada mide `'0%'` y SIGUE MONTADA. Devuelve la cadena y NO `null`/`undefined` a propósito:
 * algo falsy es justo lo que lleva al `{cond && <panel/>}` y al desmontaje que este módulo
 * existe para evitar.
 */
export function anchoCortina(opts: { colapsada: boolean; completa: boolean; pct: number }): string {
  if (opts.colapsada) return '0%';
  // Entera = todo menos la columna de tiendas. En % no se puede expresar: la columna mide px fijos.
  if (opts.completa) return `calc(100% - ${ANCHO_TIENDAS_PX}px)`;
  return `${clampMapPct(opts.pct)}%`;
}

/**
 * Qué hace UN TOQUE en la manija.
 *
 * Del boceto, textual: "un clic la lleva a cubrir toda la columna; otro clic, estando entera, la
 * cierra". Antes el toque solo alternaba mostrar/esconder, así que para taparla entera había que
 * arrastrar hasta el tope — y el tope era 60%, que no alcanzaba a cubrir la columna. Por eso se
 * veía "a medio correr" por más que se arrastrara.
 *
 * Desde a medias también va a entera: el toque siempre EMPUJA hacia la posición extrema, y solo
 * cierra cuando ya no queda más para abrir.
 */
export function alTocarCortina(
  estado: { colapsada: boolean; completa: boolean },
): { colapsada: boolean; completa: boolean } {
  if (estado.colapsada) return { colapsada: false, completa: true };
  if (estado.completa)  return { colapsada: true,  completa: false };
  return { colapsada: false, completa: true };
}

