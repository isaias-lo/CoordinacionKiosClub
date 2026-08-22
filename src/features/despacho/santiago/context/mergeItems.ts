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
  keyOf: (item: T) => string,
): Record<string, T[]> {
  // [E3b/C2] Antes el merge era por TIENDA completa (dirty ⇒ gana toda la local). Eso pisaba lo
  // que otro usuario hacía en la MISMA tienda al mismo tiempo (A edita dims mientras B agrega un
  // CH ⇒ uno perdía su cambio). Ahora, en las tiendas que edité, el merge es POR-ÍTEM (3 vías:
  // base=lastSynced, local, remoto) usando `keyOf` (id estable de C1) ⇒ conviven ambos cambios.
  const out: Record<string, T[]> = {};
  const allCods = new Set([...Object.keys(remote), ...Object.keys(local)]);
  for (const cod of allCods) {
    const loc  = local[cod] ?? [];
    const rem  = remote[cod] ?? [];
    const base = lastSynced[cod] ?? [];
    // Tienda que NO toqué desde el último sync → adopto la remota tal cual (trae ediciones más
    // nuevas de otro equipo; ausencia remota = borrado intencional). Igual que antes.
    if (JSON.stringify(loc) === JSON.stringify(base)) { out[cod] = rem; continue; }
    // Tienda editada localmente → merge por-ítem (protege mi edición sin pisar lo del otro).
    out[cod] = mergeListaPorItem(rem, loc, base, keyOf);
  }
  return out;
}

/**
 * Merge 3-vías de una lista de ítems (una tienda): `base` = último sync, `local`, `remote`.
 * Reglas por ítem (llave estable `keyOf`):
 *  - en local y remoto: gana el LOCAL si yo lo cambié (o el remoto no lo cambió); si solo cambió
 *    el remoto, adopto el remoto.
 *  - solo en local: alta local nueva (no estaba en base) ⇒ conservar; si estaba en base y el
 *    remoto ya no lo tiene ⇒ borrado remoto ⇒ no lo re-agrego.
 *  - solo en remoto: alta remota nueva (no estaba en base) ⇒ conservar; si estaba en base y yo no
 *    lo tengo ⇒ borrado local ⇒ no resucitar.
 * El borrado siempre gana sobre "reaparecer" (anti-zombie). Orden: primero la vista local, luego
 * las altas remotas nuevas al final (el `orden` se renumera aguas abajo).
 */
export function mergeListaPorItem<T>(remote: T[], local: T[], base: T[], keyOf: (i: T) => string): T[] {
  const bMap = new Map(base.map(i => [keyOf(i), i]));
  const rMap = new Map(remote.map(i => [keyOf(i), i]));
  const eq = (a?: T, b?: T) => JSON.stringify(a) === JSON.stringify(b);
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of local) {
    const k = keyOf(item);
    if (seen.has(k)) continue;
    seen.add(k);
    const inB = bMap.has(k), inR = rMap.has(k);
    if (inR) {
      const lChanged = !inB || !eq(item, bMap.get(k));
      const rChanged = inB ? !eq(rMap.get(k), bMap.get(k)) : true;
      result.push(lChanged || !rChanged ? item : rMap.get(k)!);
    } else if (!inB) {
      result.push(item); // alta local nueva
    } // inB && !inR ⇒ borrado remoto ⇒ drop
  }
  for (const item of remote) {
    const k = keyOf(item);
    if (seen.has(k)) continue;
    seen.add(k);
    if (!bMap.has(k)) result.push(item); // alta remota nueva (si estaba en base y no en local ⇒ borrado local ⇒ drop)
  }
  return result;
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
