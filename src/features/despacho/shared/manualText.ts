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
