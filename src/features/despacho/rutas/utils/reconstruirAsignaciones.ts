import type { StoreItem } from './routing';

export interface ManifiestoGuardado {
  patente?: string | null;
  // [Ver manifiestos del día] El GET de /api/rutas-despacho devuelve `*`, así que estos vienen
  // incluidos: permiten reabrir un manifiesto con su código y QR REALES (no regenerados).
  id?: number | null;
  codigo_ruta?: string | null;
  token_qr?: string | null;
  estado?: string | null;
  ruta_tiendas?: { store_cod: string; pallets?: number | null; bultos?: number | null; contenedores?: number | null }[] | null;
}

/**
 * Reconstruye las asignaciones del tablero (patente → tiendas) desde los manifiestos YA guardados
 * (`rutas_despacho` + `ruta_tiendas`).
 *
 * Por qué: el "tablero" del Enrutador (`manualAsignaciones`) es un lienzo efímero que se sincroniza
 * entre dispositivos y se puede resetear; los manifiestos guardados son la fuente de verdad
 * PERSISTENTE e idéntica en todos los dispositivos. Este helper permite volver a mostrar en el
 * tablero lo que ya quedó guardado, sin depender del estado efímero.
 *
 * Acumula por patente y deduplica por código de tienda (una patente puede aparecer en varios
 * manifiestos guardados por re-guardados). Puro y testeable.
 */
export function reconstruirAsignaciones(manifiestos: ManifiestoGuardado[] | null | undefined): Record<string, StoreItem[]> {
  const out: Record<string, StoreItem[]> = {};
  for (const m of manifiestos ?? []) {
    const pat = (m.patente ?? '').trim();
    if (!pat) continue;
    const byCod = new Map<string, StoreItem>((out[pat] ?? []).map(s => [s.c, s]));
    for (const t of m.ruta_tiendas ?? []) {
      const c = (t.store_cod ?? '').trim();
      if (!c) continue;
      byCod.set(c, { c, p: Number(t.pallets) || 0, b: Number(t.bultos) || 0, ch: Number(t.contenedores) || 0 });
    }
    if (byCod.size) out[pat] = [...byCod.values()];
  }
  return out;
}
