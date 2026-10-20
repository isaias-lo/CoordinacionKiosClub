/**
 * Utilidades puras para la UNIFICACIÓN de pallets/contenedores en bodega (Santiago + Regiones).
 *
 * El flujo inline de "Unificar" (P3 → P1) suma el peso del source al target y **conserva
 * la identidad del target** (su slot/`canonical_id`/código no cambia). El source se elimina.
 * A diferencia de `/api/picking-pallets/combine` (que crea un slot nuevo con código nuevo y
 * hereda las guías sólo del primer slot), aquí:
 *   - el target conserva su código → su etiqueta física NO se reimprime;
 *   - las guías/refs de ambos se **fusionan** en el target (no se pierden).
 *
 * Estas funciones son puras y testeables (sin React/Supabase). La suma de peso vive en
 * `combineUtils.sumPeso` y se reutiliza tal cual.
 */

/**
 * Une dos cadenas de refs/guías (formato `A+B+C`) deduplicando y limpiando espacios.
 * Se usa al fusionar el target con el source para que el pallet combinado conserve TODAS
 * las guías (hoy la API `combine` sólo conservaba las del primer slot).
 */
export function unionRefs(a?: string | null, b?: string | null): string {
  const parts = [String(a ?? ''), String(b ?? '')]
    .flatMap(s => s.split('+'))
    .map(s => s.trim())
    .filter(Boolean);
  return [...new Set(parts)].join('+');
}

/**
 * Id del slot que sobrevive a la unificación: SIEMPRE el del target (P1).
 * Documentado como función para dejar explícita la invariante "se conserva el target".
 */
export function slotQueSobrevive(targetSlotId: number, _sourceSlotId: number): number {
  return targetSlotId;
}

/**
 * Cuántas unidades se le juntaron a la que sobrevive, contando las que ya traían las dos. P1 + P3
 * = 1; si después se le une P2 (que ya era P2 + P4), 1 + 1 + 1 = 3. Se guarda en el ítem
 * (`unidos`) para que el pallet unificado se vea como tal en Bodega (Isaias, 20/10/2026: «el
 * pallet unificado, que sea notable, así se sabe que se unificó, desde lejos»).
 */
export function unidosTrasUnir(destino?: { unidos?: number } | null, origen?: { unidos?: number } | null): number {
  const n = (v?: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return n(destino?.unidos) + 1 + n(origen?.unidos);
}

/** «Unificado · 2 en 1». `null` si la unidad no se unificó. */
export function textoUnificado(unidos?: number | null): string | null {
  if (typeof unidos !== 'number' || !Number.isFinite(unidos) || unidos < 1) return null;
  return `Unificado · ${Math.floor(unidos) + 1} en 1`;
}
