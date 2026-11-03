// Las horas de la planilla. Módulo puro: entra texto de Odoo, sale texto para la hoja.
//
// Odoo guarda las fechas en UTC y sin zona («2026-11-03 11:33:29»). Leerlas como si fueran locales
// deja la planilla tres horas adelantada: en el primer mockup 27MCH Hogar aparecía empezando 11:33
// cuando el picker la tomó a las 08:33. Se convierte con la zona `America/Santiago`, que además
// resuelve sola el cambio de horario (UTC-3 en verano, UTC-4 en invierno).
//
// `todayISO()` no sirve para esto (ver CLAUDE.md): usa UTC y rueda cerca de las 20:00 en Chile.

const ZONA_CHILE = 'America/Santiago';

/** Odoo → `Date`, o `null` si el texto no es una fecha. */
function aFecha(crudo: string | null | undefined): Date | null {
  const s = String(crudo ?? '').trim();
  if (!s) return null;
  // «2026-11-03 11:33:29» no trae zona: es UTC. Se le pone la T y la Z para que no se lea local.
  const iso = /[TZ]/.test(s) ? s : s.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** La hora de Chile como `HH:MM`, o `''` si no hay dato. Nunca inventa una hora. */
export function horaChile(crudo: string | null | undefined): string {
  const d = aFecha(crudo);
  if (!d) return '';
  return d.toLocaleTimeString('es-CL', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA_CHILE,
  });
}

/**
 * Minutos entre la asignación y la validación, o `null` si falta una de las dos.
 *
 * Una validación anterior al inicio también da `null`: un número negativo en una hoja que se firma
 * es peor que una celda vacía.
 */
export function duracionMinutos(
  asignadoEn: string | null | undefined,
  validadoEn: string | null | undefined,
): number | null {
  const a = aFecha(asignadoEn);
  const b = aFecha(validadoEn);
  if (!a || !b) return null;
  const min = Math.round((b.getTime() - a.getTime()) / 60000);
  return min < 0 ? null : min;
}

/** `146` → `'2 h 26'`; `20` → `'20 min'`; `null` → `'—'`. */
export function formatearDuracion(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}
