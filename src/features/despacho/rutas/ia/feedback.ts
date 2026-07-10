// Helpers puros para el loop de feedback del asistente IA. Convierten rutas ↔ asignación
// (patente→cods) y miden cuánto se ajustó la propuesta de la IA. El resultado se guarda en
// `ia_asignacion_feedback` (vía /api/ia-feedback) y alimenta el aprendizaje del historyFetcher.

/** Rutas (patente + tiendas ordenadas) → asignación { patente: [cods] }. Omite camiones vacíos. */
export function rutasAAsignacion(rutas: { v: { p: string }; ts: { c: string }[] }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of rutas) {
    const cods = r.ts.map(t => t.c).filter(Boolean);
    if (cods.length) out[r.v.p] = cods;
  }
  return out;
}

/** Mapa cod→patente a partir de una asignación { patente: [cods] }. */
function porTienda(asig: Record<string, string[]>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [pat, cods] of Object.entries(asig)) {
    for (const c of cods) m.set(c, pat);
  }
  return m;
}

/** Nº de tiendas que quedaron en un camión distinto al que propuso la IA (incluye agregadas/quitadas).
 *  0 si no hubo propuesta IA o si la final la respeta tal cual. Señal de cuánto se ajustó. */
export function contarEdiciones(
  propuesta: Record<string, string[]> | null | undefined,
  final: Record<string, string[]>,
): number {
  if (!propuesta) return 0;
  const pa = porTienda(propuesta);
  const fi = porTienda(final);
  const cods = new Set<string>([...pa.keys(), ...fi.keys()]);
  let n = 0;
  for (const c of cods) if (pa.get(c) !== fi.get(c)) n++;
  return n;
}
