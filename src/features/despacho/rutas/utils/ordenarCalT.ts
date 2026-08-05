export interface OrdenCalDia { rm: string[]; costa: string[]; fal: string[]; }

/** Orden de grupos del pool: Regiones (fal) → Costa (costa) → Santiago (rm). */
export const GROUP_ORDER: Record<string, number> = { fal: 0, costa: 1, rm: 2 };

/**
 * Ordena las tiendas del pool del Enrutador respetando el calendario del día:
 *   1) Grupos en orden Regiones (fal) → Costa (costa) → Santiago (rm).
 *   2) Dentro de cada grupo, el orden exacto del calendario.
 *   3) Las tiendas presentes en `calT` pero NO listadas en el calendario del día ("extras")
 *      van al final, también ordenadas por grupo.
 *   4) Oculta "fantasmas" (fuera de catálogo Y sin cantidades) vía `esFantasma`.
 *
 * Puro y testeable. El orden depende SOLO del calendario del día (`calDia`), por eso es crítico
 * que el Enrutador reciba el calendario autoritativo de la BD y no un cache/estático viejo: si el
 * calendario no lista una tienda cargada hoy, esta cae como "extra" al final (bug 26ALC/57CAS).
 */
export function ordenarCalT<T extends { p?: number; b?: number; ch?: number; g?: string }>(
  calT: Record<string, T>,
  calDia: OrdenCalDia,
  enCatalogo: (cod: string) => boolean,
  esFantasma: (data: T, enCat: boolean) => boolean,
): Record<string, T> {
  const canonical: string[] = [...(calDia.fal || []), ...(calDia.costa || []), ...(calDia.rm || [])];
  const visible = (c: string) => !!calT[c] && !esFantasma(calT[c], enCatalogo(c));

  const result: Record<string, T> = {};
  canonical.forEach(c => { if (visible(c)) result[c] = calT[c]; });

  const extras = Object.keys(calT)
    .filter(c => !result[c] && visible(c))
    .sort((a, b) => (GROUP_ORDER[calT[a].g || 'fal'] ?? 0) - (GROUP_ORDER[calT[b].g || 'fal'] ?? 0));
  extras.forEach(c => { result[c] = calT[c]; });

  return result;
}
