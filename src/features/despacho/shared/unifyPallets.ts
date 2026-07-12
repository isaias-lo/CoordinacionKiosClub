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
