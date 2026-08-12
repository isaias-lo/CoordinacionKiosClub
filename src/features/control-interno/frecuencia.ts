// Deriva la FRECUENCIA de una tienda (días en que se despacha) desde un calendario (Abastecimiento
// o Congelados — la función es genérica), en vez de un campo manual (que suele quedar vacío/
// desactualizado). Ej: si ALC está en MA, JU y VI del calendario → "MA-JU-VI". Puro y testeable.

export interface CalDiaGrupos { rm?: string[]; costa?: string[]; fal?: string[] }

/** Orden canónico de días (como en getDia / el Calendario). */
export const DIAS_ORDEN = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'] as const;

/**
 * Días (en orden canónico, unidos por "-") en que `cod` aparece en el calendario, en cualquier
 * grupo (rm/costa/fal). Devuelve '' si la tienda no está en el calendario. Puro.
 */
export function frecuenciaDesdeCalendario(
  cod: string,
  cal: Record<string, CalDiaGrupos> | null | undefined,
): string {
  if (!cod || !cal) return '';
  const dias: string[] = [];
  for (const d of DIAS_ORDEN) {
    const day = cal[d];
    if (!day) continue;
    const enDia = (day.rm ?? []).includes(cod) || (day.costa ?? []).includes(cod) || (day.fal ?? []).includes(cod);
    if (enDia) dias.push(d);
  }
  return dias.join('-');
}

/** Mapa cod → frecuencia para todas las tiendas presentes en el calendario. Puro. */
export function frecuenciasPorTienda(cal: Record<string, CalDiaGrupos> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cal) return out;
  for (const d of DIAS_ORDEN) {
    const day = cal[d];
    if (!day) continue;
    for (const cod of [...(day.rm ?? []), ...(day.costa ?? []), ...(day.fal ?? [])]) {
      if (!cod) continue;
      if (!out[cod]) out[cod] = '';
      // Evita duplicar el día si la tienda está en varios grupos el mismo día.
      if (!out[cod].split('-').filter(Boolean).includes(d)) {
        out[cod] = out[cod] ? `${out[cod]}-${d}` : d;
      }
    }
  }
  return out;
}
