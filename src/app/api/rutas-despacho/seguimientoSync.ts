import type { SupabaseClient } from '@supabase/supabase-js';
import { elegirFechaDespacho, type DespachoCandidato } from '@/lib/recepcionEstado';

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
 * Sincroniza el `seguimiento` en `despacho_rm` / `despacho_regiones` para las tiendas de un
 * manifiesto/ruta.
 *
 * CLAVE (bug corregido): NO se matchea por la fecha del manifiesto. El manifiesto lleva la fecha
 * de SALIDA (p.ej. 31/07) pero las filas de despacho están en la fecha de ARMADO (30/07, 29/07…),
 * así que un match por fecha exacta no encontraba nada y el panel se quedaba en "Registrado".
 * En su lugar, para cada tienda se resuelve el despacho activo correcto con `elegirFechaDespacho`
 * (mismo criterio que usa la recepción, que sí funcionaba) y se actualiza esa fecha.
 *
 * `soloDesdeRegistrado`: solo avanza filas aún en 'Registrado' (guardar manifiesto: Registrado →
 * Pendiente sin regresar rutas ya despachadas). En false (cambio de estado explícito) sin condición.
 */
export async function syncSeguimientoDespacho(
  sb: SupabaseClient,
  cods: string[],
  seguimiento: string,
  soloDesdeRegistrado = false,
): Promise<void> {
  const limpios = [...new Set((cods ?? []).filter(Boolean))];
  if (!limpios.length || !seguimiento) return;

  // Candidatos de ambas tablas para TODAS las tiendas de una vez.
  const [{ data: rm }, { data: reg }] = await Promise.all([
    sb.from('despacho_rm').select('cod, fecha, seguimiento, created_at').in('cod', limpios),
    sb.from('despacho_regiones').select('cod, fecha, seguimiento, created_at').in('cod', limpios),
  ]);

  const porCod = new Map<string, DespachoCandidato[]>();
  for (const r of [...(rm ?? []), ...(reg ?? [])] as (DespachoCandidato & { cod: string })[]) {
    const arr = porCod.get(r.cod) ?? [];
    arr.push(r);
    porCod.set(r.cod, arr);
  }

  await Promise.all([...porCod.entries()].map(async ([cod, cands]) => {
    const fecha = elegirFechaDespacho(cands);
    if (!fecha) return;
    const upd = (tabla: 'despacho_rm' | 'despacho_regiones') => {
      const q = sb.from(tabla).update({ seguimiento }).eq('cod', cod).eq('fecha', fecha);
      return soloDesdeRegistrado ? q.eq('seguimiento', 'Registrado') : q;
    };
    await Promise.all([upd('despacho_rm'), upd('despacho_regiones')]);
  }));
}
