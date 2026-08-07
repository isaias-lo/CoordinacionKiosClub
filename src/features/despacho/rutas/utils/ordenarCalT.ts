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
  const visible = (c: string) => !!calT[c] && !esFantasma(calT[c], enCatalogo(c));
  const result: Record<string, T> = {};
  const add = (c: string) => { if (!result[c] && visible(c)) result[c] = calT[c]; };

  // Por cada grupo (Regiones → Costa → Santiago): primero las del calendario del día (en su
  // orden), y LUEGO las "extras" de ESE grupo (presentes en calT pero fuera del calendario:
  // armadas hoy o con un calendario desactualizado). Así una tienda de Regiones (fal) nunca cae
  // DESPUÉS de las de Santiago (rm) por ser "extra" (bug 57CAS/26ALC al final del pool).
  const grupos: [keyof OrdenCalDia, string][] = [['fal', 'fal'], ['costa', 'costa'], ['rm', 'rm']];
  for (const [key, g] of grupos) {
    (calDia[key] || []).forEach(add);                                                    // calendario del grupo
    Object.keys(calT).filter(c => !result[c] && visible(c) && (calT[c].g || 'fal') === g).forEach(add); // extras del grupo
  }
  // Extras con grupo desconocido (p. ej. 'manual') → al final.
  Object.keys(calT).forEach(add);

  return result;
}
