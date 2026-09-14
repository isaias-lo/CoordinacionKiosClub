// La ventana de recepción de una tienda. Puro y testeable. UNA sola implementación.
//
// Había DOS `parseVentana` en el proyecto, con campos distintos y criterios distintos:
//
//   planificador.ts   { open, close }    split('-')   no validaba nada
//   enrutadorV2.ts    { abre, cierra }   regex        rechazaba cierra <= abre
//
// Mismo dato, dos verdades. Es el mismo patrón que dejó el chocolate arreglado en un camino y
// roto en el otro: dos copias de la misma regla que se arreglan por separado. Y el parser frágil
// era justo el del Planificador — `split('-')` devuelve null ante cualquier formato que no sean
// exactamente dos partes, y "sin ventana" se trata como "no restringe", así que una ventana mal
// escrita desaparece en silencio en vez de avisar.
//
// Acá queda una, con el criterio del más estricto.

/** Minutos desde medianoche de un "HH:MM". null si no es una hora válida. */
export function aMinutosDelDia(hhmm?: string | null): number | null {
  const m = String(hhmm ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export interface Ventana {
  /** Minutos del día en que abre. */
  abre: number;
  /** Minutos del día en que cierra. */
  cierra: number;
}

/**
 * Parsea la ventana del catálogo. Tolera espacios alrededor del guion.
 *
 * Si vienen VARIOS tramos ("09:00-12:00 / 15:00-18:00") se toma el PRIMERO: el despacho es de
 * mañana y ese es el que aplica. Una ventana invertida (cierra ≤ abre) se descarta: no es una
 * ventana, es un dato malo, y tratarla como válida haría que todo llegue "tarde".
 */
export function parseVentana(v?: string | null): Ventana | null {
  const m = String(v ?? '').match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!m) return null;
  const abre = aMinutosDelDia(m[1]);
  const cierra = aMinutosDelDia(m[2]);
  if (abre == null || cierra == null || cierra <= abre) return null;
  return { abre, cierra };
}

export type EstadoVentana = 'ok' | 'temprano' | 'tarde' | 'sin-ventana';

/**
 * Cómo cae una hora de llegada respecto de la ventana.
 * 'temprano' = antes de abrir (se espera) · 'tarde' = después de cerrar · 'sin-ventana' = no restringe.
 */
export function estadoVentana(etaMin: number, ventana?: string | null): EstadoVentana {
  const w = parseVentana(ventana);
  if (!w) return 'sin-ventana';
  if (etaMin < w.abre) return 'temprano';
  if (etaMin > w.cierra) return 'tarde';
  return 'ok';
}

// ── Dureza de la ventana ─────────────────────────────────────────────────────────
//
// Del Colab: un MALL tiene ventana DURA (el andén cierra y no hay negociación) y el resto la tiene
// BLANDA (llegar tarde molesta, pero se recibe).
//
// El Handoff avisa que atar la dureza al formato es frágil (§5.12): «Hay strips con administrador
// estricto y malls flexibles; el formato no es la restricción». Por eso `dureza` se puede pasar
// explícita por tienda y el formato es solo el DEFAULT — cuando exista la columna por tienda,
// entra por acá sin tocar el algoritmo.

export type DurezaVentana = 'dura' | 'blanda';

/** Dureza por defecto según el formato de la tienda. MALL → dura; todo lo demás → blanda. */
export function durezaPorFormato(tipo?: string | null): DurezaVentana {
  return String(tipo ?? '').trim().toUpperCase().includes('MALL') ? 'dura' : 'blanda';
}

/**
 * Minutos que se le restan al cierre para optimizar con colchón (§4.1 del Handoff).
 *
 * Se planifica contra `cierre − buffer` y se VALIDA contra el cierre real: el plan nace con
 * margen, pero los reportes no muestran números inflados. En la corrida del notebook los malls
 * cerraron con 20–23 min de margen real.
 */
export const BUFFER_CIERRE_MIN = 10;

/** El cierre con el que se OPTIMIZA (no el que se muestra). Nunca baja de la apertura. */
export function cierreEfectivo(w: Ventana, buffer = BUFFER_CIERRE_MIN): number {
  return Math.max(w.abre, w.cierra - buffer);
}
