/**
 * Merge de items por-tienda entre el estado REMOTO (llegó por Realtime/fetch) y el LOCAL, usando
 * como línea base el último estado SINCRONIZADO (`lastSynced` = lo último que empujé o adopté).
 *
 * Regla por tienda:
 *  - Si la edité localmente desde el último sync (local ≠ lastSynced) → conservo MI versión
 *    (no perder una edición local aún sin empujar).
 *  - Si el remoto no tiene esa tienda → conservo la local (no la borro por una ausencia remota).
 *  - Si NO la toqué y el remoto sí la tiene → adopto la versión REMOTA (puede ser una edición más
 *    nueva del otro dispositivo, p. ej. "unir bultos"/CH en un pallet).
 *
 * El bug que corrige: antes se hacía `{ ...remote, ...local }`, con lo que la copia local de TODAS
 * las tiendas pisaba la remota —incluidas tiendas que este dispositivo no cambió—. Así, tras unir
 * CH en un pallet desde el móvil, la PC (con su copia vieja) reafirmaba la tienda y el móvil la
 * re-adoptaba → "revertía" y reaparecían los CH. Ahora sólo gano yo en las tiendas que realmente
 * cambié.
 */
export function mergeItemsByTienda<T>(
  remote: Record<string, T[]>,
  local: Record<string, T[]>,
  lastSynced: Record<string, T[]>,
): Record<string, T[]> {
  // Mismo criterio que la Bodega Nacional (AppContext): recorrer la UNIÓN de tiendas y, por cada
  // una, si la cambié desde el último sync ("dirty") gana la local; si está limpia, manda la remota
  // (una ausencia remota = borrado intencional; NO restaurar desde local, que es justo lo que hacía
  // reaparecer datos ya unidos/limpiados).
  const out: Record<string, T[]> = {};
  const allCods = new Set([...Object.keys(remote), ...Object.keys(local)]);
  for (const cod of allCods) {
    const dirty = JSON.stringify(local[cod] ?? []) !== JSON.stringify(lastSynced[cod] ?? []);
    out[cod] = dirty ? (local[cod] ?? []) : (remote[cod] ?? []);
  }
  return out;
}

/**
 * Igual que {@link mergeItemsByTienda} pero para un mapa de UN registro por clave
 * (`Record<string, Entry>`, p. ej. las guías PDF: una guía por tienda), no una lista.
 *
 * Por cada clave: si la cambié desde el último sync ("dirty") gana la local (incluye borrado:
 * dirty + local ausente ⇒ NO la re-agrego); si está limpia, manda la remota (ausencia remota =
 * borrado intencional del otro dispositivo ⇒ no restaurar desde local). Es el MISMO criterio que
 * usa el merge de `pdfData` en AppContext (Bodega Nacional) — así las guías quedan con la misma
 * resiliencia cross-device que ya tenía Nacional.
 */
export function mergeEntriesByKey<T>(
  remote: Record<string, T>,
  local: Record<string, T>,
  lastSynced: Record<string, T>,
): Record<string, T> {
  const out: Record<string, T> = {};
  const allKeys = new Set([...Object.keys(remote), ...Object.keys(local), ...Object.keys(lastSynced)]);
  for (const k of allKeys) {
    const dirty = JSON.stringify(local[k]) !== JSON.stringify(lastSynced[k]);
    if (dirty) {
      if (local[k] !== undefined) out[k] = local[k]; // subida/cambio local aún sin empujar
      // dirty + local ausente ⇒ lo borré localmente ⇒ no lo re-agrego
    } else if (remote[k] !== undefined) {
      out[k] = remote[k]; // limpio ⇒ manda el remoto (una edición más nueva del otro equipo)
    } else if (local[k] !== undefined) {
      // limpio + el remoto NO trae la clave PERO yo sí la tengo → la CONSERVO. Antes se borraba
      // (se asumía "borrado remoto"), pero un remoto stale/parcial —p. ej. el catch-up que
      // re-consulta justo tras subir un PDF— hacía DESAPARECER la guía recién subida. El reset
      // diario NO depende de esto (las guías usan clave localStorage por día), así que conservar
      // es seguro. Trade-off: un borrado hecho en OTRO equipo no se propaga solo (raro).
      out[k] = local[k];
    }
  }
  return out;
}

/** Extrae de forma segura el `items` del snapshot JSON guardado en `lastPushedRef`. */
export function itemsFromSnapshot<T>(snapshotJson: string): Record<string, T[]> {
  try {
    const parsed = JSON.parse(snapshotJson || '{}') as { items?: Record<string, T[]> };
    return parsed.items ?? {};
  } catch {
    return {};
  }
}
