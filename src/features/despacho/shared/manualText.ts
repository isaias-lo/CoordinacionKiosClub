// Lógica pura del panel "Manual" (texto COD: 2P - 1B). Sin JSX → testeable.

export interface ManualLine {
  cod: string;
  nombre?: string;
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
  const text = withItems.length
    ? withItems.map(l => `${l.cod}: ${partsOf(l.p, l.b, l.c, l.ch)}`).join('\n')
      + `\n\nTOTAL: ${partsOf(tot.p, tot.b, tot.c, tot.ch)}`
    : '';
  return { text, withItems, tot };
}
