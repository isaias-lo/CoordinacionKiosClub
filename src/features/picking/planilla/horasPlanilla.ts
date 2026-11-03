// Las horas de la planilla. Módulo puro: entra texto de Odoo, sale texto para la hoja.
//
// ── POR QUÉ LA CONVERSIÓN NO SE ESCRIBE ACÁ ───────────────────────────────────────────────────
//
// Odoo guarda las fechas en UTC y sin zona («2026-11-03 11:33:29»). Leerlas como si fueran locales
// deja la planilla tres horas adelantada: en el primer mockup 27MCH Hogar aparecía empezando 11:33
// cuando el picker la tomó a las 08:33.
//
// Ese bug ya está resuelto en el repositorio, y su arreglo está documentado: el comentario de
// `odooDateToISO` (`lib/fechaChile.ts`) dice que al pasarle el naive tal cual a `new Date(...)`
// «JS lo interpreta como hora LOCAL del navegador/servidor, y luego fmtHoraChile lo desplazaría
// una segunda vez, mostrando la hora equivocada». Así que la conversión sale de ahí y no de una
// copia nueva: `odooDateToISO` marca la Z y `fmtHoraChile` formatea en `America/Santiago`, que
// además resuelve solo el cambio de horario (UTC-3 en verano, UTC-4 en invierno).
//
// `todayISO()` no sirve para nada de esto (ver CLAUDE.md): usa UTC y rueda cerca de las 20:00.

import { odooDateToISO, fmtHoraChile } from '@/lib/fechaChile';

/** Lo que puede llegar de Odoo: el naive en texto, o `false` cuando el campo está vacío. */
export type FechaOdoo = string | false | null | undefined;

/** Odoo → `Date`, o `null` si no hay fecha. */
function aFecha(crudo: FechaOdoo): Date | null {
  const iso = odooDateToISO(typeof crudo === 'string' ? crudo : null);
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * La hora de Chile como `HH:MM`, o `''` si no hay dato. Nunca inventa una hora.
 *
 * Devuelve `''` y no el `'—'` de `fmtHoraChile` a propósito: esta misma cadena va al CSV, donde
 * una celda vacía es un dato ausente y un guion es texto que la planilla de cálculo no suma. El
 * guion lo pone quien muestra en pantalla (`horaChile(x) || '—'`).
 */
export function horaChile(crudo: FechaOdoo): string {
  const d = aFecha(crudo);
  if (!d) return '';
  return fmtHoraChile(d);
}

/**
 * Minutos entre la asignación y la validación, o `null` si falta una de las dos.
 *
 * Los dos extremos se truncan al minuto antes de restar, porque la hoja muestra `HH:MM` y se
 * firma: con los segundos crudos, 08:33:50 → 10:59:10 daba 145 mientras que restar a mano las dos
 * horas impresas da 146, y quien firma no puede verificar esa diferencia.
 *
 * Mide tiempo REAL, no horas de reloj, y eso importa dos veces al año. Medido: el 05/04/2026 las
 * 02:30 y las 03:30 UTC muestran las dos «23:30» en la hoja, porque Chile vuelve a UTC-4 y la hora
 * de pared se repite. Restar las horas impresas daría cero donde pasaron sesenta minutos.
 *
 * Una validación anterior al inicio también da `null`. No debería pasar —sería dato corrupto o un
 * movimiento reasignado en Odoo—, pero un número negativo en una hoja firmada es peor que una
 * celda vacía.
 */
export function duracionMinutos(asignadoEn: FechaOdoo, validadoEn: FechaOdoo): number | null {
  const a = aFecha(asignadoEn);
  const b = aFecha(validadoEn);
  if (!a || !b) return null;
  const min = Math.floor(b.getTime() / 60000) - Math.floor(a.getTime() / 60000);
  return min < 0 ? null : min;
}

/**
 * `146` → `'2 h 26'`; `20` → `'20 min'`; `null` → `'—'`.
 *
 * No usa `fmtDuration` (`picking-utils.ts:338`), que da «2h 26m», por dos razones: es el formato
 * del mockup que el coordinador aprobó, y `fmtDuration(0)` devuelve `'—'`, mientras que acá un
 * movimiento de cero minutos es un dato real y no un dato ausente.
 */
export function formatearDuracion(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}
