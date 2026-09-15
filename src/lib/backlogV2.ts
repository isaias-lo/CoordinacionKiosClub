// Trae el backlog de 2ª vuelta desde /api/backlog-v2.
//
// El cálculo NO puede vivir en el navegador: `rutas_despacho` tiene RLS activo y ninguna política,
// así que desde el cliente devuelve cero filas **sin error**. La primera versión de esto consultaba
// esa tabla directo y creía que no existía ningún manifiesto: marcaba como pendiente TODO lo que
// tuviera carga — 164 filas donde había 15 reales. El resto de la app nunca lo notó porque lee los
// manifiestos por /api/rutas-despacho, que corre con service role.
//
// Un `select` que devuelve vacío por RLS es el peor tipo de error: no rompe nada, solo miente.

import type { PendienteBacklog } from '@/features/despacho/rutas/utils/backlogSegundaVuelta';

/** Los pendientes deducidos de los últimos `dias` días, sin contar hoy. */
export async function fetchBacklogCalculado(dias = 10): Promise<PendienteBacklog[]> {
  try {
    const res = await fetch(`/api/backlog-v2?dias=${dias}`);
    if (!res.ok) { console.error('[backlogV2]', res.status); return []; }
    const json = await res.json() as { pendientes?: PendienteBacklog[] };
    return json.pendientes ?? [];
  } catch (err) {
    console.error('[backlogV2]', err);
    return [];
  }
}
