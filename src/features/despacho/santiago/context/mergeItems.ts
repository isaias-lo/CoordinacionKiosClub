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

/** Extrae de forma segura el `items` del snapshot JSON guardado en `lastPushedRef`. */
export function itemsFromSnapshot<T>(snapshotJson: string): Record<string, T[]> {
  try {
    const parsed = JSON.parse(snapshotJson || '{}') as { items?: Record<string, T[]> };
    return parsed.items ?? {};
  } catch {
    return {};
  }
}
