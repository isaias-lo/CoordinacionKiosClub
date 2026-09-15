// Lógica pura del panel "Manual" (texto COD: 2P - 1B). Sin JSX → testeable.

export type ManualGrupo = 'rm' | 'costa' | 'fal';

export interface ManualLine {
  cod: string;
  nombre?: string;
  g?: ManualGrupo;   // grupo para filtrar (RM / COSTA / REGIONES)
  p: number;
  b: number;
  c: number;
  ch: number;
}

export interface CalendarStore {
  cod: string;
  nombre?: string;
}

export function partsOf(p: number, b: number, c: number, ch: number): string {
  return [p && `${p}P`, b && `${b}B`, c && `${c}C`, ch && `${ch}CH`].filter(Boolean).join(' - ');
}

/** La línea de cierre: "TOTAL: 5P - 2B - 3 TIENDAS". Los chocolates se suman como bultos,
 *  igual que en el Enrutador. Separada para que la pantalla la muestre sin recalcular el formato. */
export function lineaTotal(tot: { p: number; b: number; c: number; ch: number }, nTiendas: number): string {
  return `TOTAL: ${partsOf(tot.p, tot.b + tot.ch, tot.c, 0)} - ${nTiendas} TIENDA${nTiendas === 1 ? '' : 'S'}`;
}

/** Construye el texto "COD: 2P - 1B" + TOTAL de lo cargado en la pantalla (función pura). */
export function buildManualText(lines: ManualLine[]): {
  text: string;
  withItems: ManualLine[];
  tot: { p: number; b: number; c: number; ch: number };
} {
  const withItems = lines.filter(l => l.p || l.b || l.c || l.ch);
  const tot = withItems.reduce(
    (a, l) => ({ p: a.p + l.p, b: a.b + l.b, c: a.c + l.c, ch: a.ch + l.ch }),
    { p: 0, b: 0, c: 0, ch: 0 },
  );
  const n = withItems.length;
  // En el TOTAL los chocolates se suman como bultos (igual que el Enrutador). En las
  // líneas por tienda el CH sí se muestra aparte.
  const text = n
    ? withItems.map(l => `${l.cod}: ${partsOf(l.p, l.b, l.c, l.ch)}`).join('\n')
      + `\n\n${lineaTotal(tot, n)}`
    : '';
  return { text, withItems, tot };
}

// ── Qué filas de despacho_sesion entran al Manual ────────────────────────────────
//
// El Manual de Bodega listaba TODAS las filas del día, congelados incluido. Y como el resumen se
// arma en un Map indexado por CÓDIGO DE TIENDA, una tienda con fila seca y fila de congelados
// terminaba con una pisando a la otra — gana la que venga última, que es azar.
//
// Verificado sobre el 15/09: 01TPS, 10TRQ, 13PIE, 21NUC y 26ALC tenían las dos filas, y otras 11
// tenían SOLO fila de congelados, apareciendo en un resumen de bodega seca donde no van.
//
// Congelados no se suma al seco en ninguna parte del sistema —tiene su propio tablero, su propia
// hoja y su propio registro— y el Manual no es la excepción. Las cajas viajan en el campo `bultos`,
// así que sin filtrar se leen como bultos secos: números que parecen correctos y no lo son.

/** Lo mínimo para decidir si una fila del día entra al Manual. */
export interface FilaSesionManual { fuente?: string | null }

/** `true` si la fila es de congelados (su fuente empieza con 'congelados'). */
export function esFilaCongelados(fila: FilaSesionManual): boolean {
  return String(fila.fuente ?? '').startsWith('congelados');
}

/** Las filas que SÍ entran al Manual: todo menos congelados. */
export function filasParaManual<T extends FilaSesionManual>(filas: T[]): T[] {
  return filas.filter(f => !esFilaCongelados(f));
}
