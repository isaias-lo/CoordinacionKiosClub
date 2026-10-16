// Fecha local de Chile (America/Santiago) en formato YYYY-MM-DD.
//
// Por qué: el servidor corre en UTC (Vercel) y `new Date().toISOString()`
// devuelve la fecha UTC, que entrada la tarde en Chile ya rodó al día siguiente.
// Esto provocaba que las guías subidas en Estado no calzaran con la fecha de la
// ruta. Este helper es DST-safe vía Intl con timeZone fijo.

const TZ = 'America/Santiago';

/**
 * Fecha de Chile en YYYY-MM-DD, opcionalmente desplazada `offsetDays` días.
 *
 * **Esta es la única forma correcta de preguntar "¿qué día es hoy?" en esta app.** No usar
 * `new Date().toISOString().slice(0,10)` (da el día UTC: pasadas las ~20:00 en Chile ya rodó al
 * siguiente) ni `getFullYear/getMonth/getDate` (da el día del RELOJ DEL EQUIPO, que en el servidor
 * es UTC — de ahí los errores de hidratación de React: el servidor dibujaba un día y el navegador
 * otro, y Picking › Actividad mostraba mañana mientras Bodega y el Enrutador mostraban hoy).
 */
export function fechaChile(offsetDays = 0): string {
  const hoy = fechaChileDe(new Date());
  if (!offsetDays) return hoy;
  const [y, m, d] = hoy.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  return dt.toISOString().slice(0, 10);
}

/** El día de Chile (YYYY-MM-DD) en que cae un instante dado. Mismo resultado en servidor y cliente. */
export function fechaChileDe(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
}

/** El primer instante (ms) en que en Chile ya es `fecha` (YYYY-MM-DD). */
function inicioDiaChileMs(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  const medianocheUTC = Date.UTC(y, m - 1, d);
  // Chile está a UTC−3 o UTC−4 (y algún día pudo ser −5): se prueba de menor a mayor y se queda
  // con la primera hora que ya es ese día en Chile y cuyo milisegundo anterior todavía no lo era.
  for (let h = 2; h <= 6; h++) {
    const t = medianocheUTC + h * 3_600_000;
    if (fechaChileDe(t) === fecha && fechaChileDe(t - 1) !== fecha) return t;
  }
  return medianocheUTC + 3 * 3_600_000;
}

/**
 * Los límites de un día de Chile como instantes ISO, para filtrar columnas `timestamptz`:
 * `desde` incluido, `hasta` EXCLUIDO (es el comienzo del día siguiente).
 *
 * Filtrar con `${fecha}T00:00Z … T23:59Z` toma el día UTC: deja fuera lo que pasó después de las
 * ~21:00 de Chile y mete lo de la noche anterior.
 */
export function limitesDiaChile(fecha: string): { desde: string; hasta: string } {
  const [y, m, d] = fecha.split('-').map(Number);
  const siguiente = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return {
    desde: new Date(inicioDiaChileMs(fecha)).toISOString(),
    hasta: new Date(inicioDiaChileMs(siguiente)).toISOString(),
  };
}

// ── Formato de timestamps para mostrar SIEMPRE en hora de Chile ──────────────
// Los timestamptz se guardan en UTC (correcto). Estos helpers convierten al
// mostrar, forzando timeZone America/Santiago para que la hora sea la real de
// Chile sin depender de la zona horaria configurada en el equipo del usuario.

/** Normaliza la entrada (ISO string, Date o epoch) a Date; null si es inválida. */
function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Odoo devuelve datetimes NAIVE en UTC: "YYYY-MM-DD HH:MM:SS" (sin zona horaria). Si se le pasa
// tal cual a `new Date(...)`, JS lo interpreta como hora LOCAL del navegador/servidor, y luego
// fmtHoraChile (que fuerza timeZone America/Santiago) lo desplazaría una segunda vez, mostrando
// la hora equivocada. Esta función marca la 'Z' para que la conversión a Chile ocurra una sola vez.
const NAIVE_ODOO_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/** Convierte un datetime naive de Odoo ("YYYY-MM-DD HH:MM:SS", UTC) a ISO con 'Z'. */
export function odooDateToISO(value: string | null | undefined): string | null {
  if (!value) return null;
  if (NAIVE_ODOO_DATETIME_RE.test(value)) return value.replace(' ', 'T') + 'Z';
  return value; // ya viene en otro formato (p. ej. ISO) — se pasa tal cual
}

/** Solo la hora (HH:MM, 24h) en zona de Chile. Ej: "14:21". `withSeconds` agrega :SS. */
export function fmtHoraChile(value: string | number | Date | null | undefined, withSeconds = false): string {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleTimeString('es-CL', {
    timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}),
  });
}

/** Solo la fecha (DD-MM-AAAA según es-CL) en zona de Chile. */
export function fmtFechaChile(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleDateString('es-CL', { timeZone: TZ });
}

/** Fecha + hora (24h) en zona de Chile. Ej: "16-06-2026 14:21". */
export function fmtFechaHoraChile(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  return `${d.toLocaleDateString('es-CL', { timeZone: TZ })} ${d.toLocaleTimeString('es-CL', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit' })}`;
}
