import type { SupabaseClient } from '@supabase/supabase-js';

/** Mapeo estado de `rutas_despacho` → seguimiento de `despacho_rm` / `despacho_regiones`. */
export const ESTADO_TO_SEGUIMIENTO: Record<string, string> = {
  pendiente:  'Pendiente',
  en_camino:  'En camino',
  entregado:  'Entregado',
  recibido:   'Recibido',
};

/** Convierte fecha ISO (YYYY-MM-DD) al formato DD/MM/YYYY que usa `despacho_rm.fecha`. Puro. */
export function isoToFecha(iso: string): string {
  const [y, m, d] = (iso ?? '').split('-');
  if (!y || !m || !d) return iso ?? '';
  return `${d}/${m}/${y}`;
}

/**
 * Sincroniza el `seguimiento` en `despacho_rm` y `despacho_regiones` para (fecha, cods).
 *
 * `soloDesdeRegistrado`: si es true, solo avanza filas que aún están en 'Registrado' — así el
 * guardado del manifiesto sube Registrado → Pendiente sin regresar rutas ya "En camino"/entregadas
 * si se vuelve a guardar. En false (cambio de estado explícito) actualiza sin condición.
 *
 * No es puro (toca la BD): la lógica pura vive en `isoToFecha` / `ESTADO_TO_SEGUIMIENTO`.
 */
export async function syncSeguimientoDespacho(
  sb: SupabaseClient,
  fechaIso: string,
  cods: string[],
  seguimiento: string,
  soloDesdeRegistrado = false,
): Promise<void> {
  const limpios = [...new Set((cods ?? []).filter(Boolean))];
  if (!limpios.length || !fechaIso || !seguimiento) return;
  const fechaFiltro = isoToFecha(fechaIso);
  const upd = (tabla: 'despacho_rm' | 'despacho_regiones') => {
    const q = sb.from(tabla).update({ seguimiento }).in('cod', limpios).eq('fecha', fechaFiltro);
    return soloDesdeRegistrado ? q.eq('seguimiento', 'Registrado') : q;
  };
  await Promise.all([upd('despacho_rm'), upd('despacho_regiones')]);
}
