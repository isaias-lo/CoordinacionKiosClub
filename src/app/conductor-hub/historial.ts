/**
 * [Panel Conductor · Fase 4] Formatear una fecha "YYYY-MM-DD" (la que ya usa toda la app — ver
 * `fechaChile()`) para el historial, SIN pasar por `Date` + `timeZone: 'America/Santiago'`.
 *
 * `new Date("2026-09-10")` se ancla a medianoche UTC de ese día. Formatearlo con
 * `timeZone: 'America/Santiago'` (UTC-3/-4) lo corre al día ANTERIOR (esa medianoche UTC cae en
 * la tarde/noche de Chile del día de antes) — el mismo error de un día que ya se documentó para
 * "qué día es hoy" en `lib/fechaChile.ts`. Como la fecha ya es el día calendario correcto (viene
 * de la columna `fecha`, generada con `fechaChile()`), se formatea anclando y leyendo en UTC —
 * nunca se cruza la medianoche, mismo truco que ya usa `addDaysIso` en la API.
 */
export function formatFechaHistorial(fechaISO: string): string {
  const [y, m, d] = fechaISO.split('-').map(Number);
  if (!y || !m || !d) return fechaISO;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('es-CL', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' });
}
