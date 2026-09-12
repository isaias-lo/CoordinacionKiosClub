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
export const MAP_PCT_MAX = 60;

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
 * El valor de `flex` del panel del mapa.
 *
 * Colapsado devuelve `'0 0 0px'` y NO `null`/`undefined`: devolver algo falsy es justo lo que
 * llevaría a `{cond && <panel/>}` y al desmontaje que este módulo existe para evitar.
 */
export function anchoMapa(colapsado: boolean, pct: number): string {
  return colapsado ? '0 0 0px' : `0 0 ${clampMapPct(pct)}%`;
}

/** El `flex` de la columna de contenido: se queda con lo que el mapa no ocupa. */
export function anchoContenido(colapsado: boolean, pct: number, hayMapa: boolean): string {
  if (!hayMapa || colapsado) return '1 1 100%';
  return `1 1 ${100 - clampMapPct(pct)}%`;
}

