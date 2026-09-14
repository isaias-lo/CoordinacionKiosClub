// Qué filas de CONTROL DESPACHO CONG. toca el cierre de un camión. Puro y testeable.
//
// Existe por un bug que casi entra sin que nadie lo viera: el cierre escribía la fila COMPLETA.
//
// Bodega registra 22LGN como CC 12 · CN 1. El Enrutador, al cerrar el camión, solo conoce el
// TOTAL (13): `pushCounts` guarda `b: cajas` y no el desglose, porque el tablero no lo necesita.
// Así que el cierre habría reescrito la fila como CC 0 · CN 13. El total queda bien y el desglose
// se pierde — que es justo el tipo de daño que no se nota hasta que alguien cuenta cajas de cartón.
//
// La regla, entonces: el cierre toca UNA sola celda, la patente. Las cajas son de Bodega y el
// cierre no tiene nada que decir sobre ellas. Es lo mismo que hace el CONTROL DESPACHO del seco,
// que solo escribe las columnas de patente sobre la fila que ya está.

/** Índices de columna (0-based) de la hoja CONTROL DESPACHO CONG. */
export const COL_FECHA_DESPACHO = 1;  // B
export const COL_TIENDA         = 3;  // D
export const COL_PATENTE        = 7;  // H

export interface RuteoCong {
  /** Fila de la hoja, 1-indexed (incluye el encabezado en la 1). */
  fila: number;
  patente: string;
}

export interface PlanRuteoCong {
  updates: RuteoCong[];
  /** Tiendas ruteadas que NO tienen fila: se rutearon sin haberse registrado. */
  sinFila: string[];
}

function clave(fechaDespacho: unknown, cod: unknown): string {
  return `${String(fechaDespacho ?? '').trim()}::${String(cod ?? '').trim().toUpperCase()}`;
}

/**
 * Cruza lo que el cierre quiere escribir contra lo que ya hay en la hoja.
 *
 * `existentes` son los valores crudos de la hoja, con el encabezado en la posición 0.
 *
 * Una tienda ruteada sin fila NO se crea: sin el registro de Bodega no se sabe cuántas cajas CC y
 * CN lleva, y una fila en cero mentiría. Se devuelve en `sinFila` para poder avisar — que alguien
 * rutee carga que nunca se registró es un problema de verdad, no un detalle de escritura.
 */
export function planRuteoCongelados(
  existentes: unknown[][],
  filas: (string | number)[][],
): PlanRuteoCong {
  const filaPorClave = new Map<string, number>();
  for (let i = 1; i < existentes.length; i++) {
    const f = existentes[i];
    if (!f) continue;
    const k = clave(f[COL_FECHA_DESPACHO], f[COL_TIENDA]);
    if (f[COL_FECHA_DESPACHO] && f[COL_TIENDA] && !filaPorClave.has(k)) filaPorClave.set(k, i + 1);
  }

  const updates: RuteoCong[] = [];
  const sinFila: string[] = [];
  for (const r of filas) {
    const cod     = String(r[COL_TIENDA] ?? '').trim().toUpperCase();
    const patente = String(r[COL_PATENTE] ?? '').trim();
    if (!cod || !patente) continue;   // sin patente no hay nada que rutear
    const fila = filaPorClave.get(clave(r[COL_FECHA_DESPACHO], cod));
    if (fila) updates.push({ fila, patente });
    else      sinFila.push(cod);
  }

  return { updates, sinFila };
}
