// Fecha local de Chile (America/Santiago) en formato YYYY-MM-DD.
//
// Por qué: el servidor corre en UTC (Vercel) y `new Date().toISOString()`
// devuelve la fecha UTC, que entrada la tarde en Chile ya rodó al día siguiente.
// Esto provocaba que las guías subidas en Estado no calzaran con la fecha de la
// ruta. Este helper es DST-safe vía Intl con timeZone fijo.

const TZ = 'America/Santiago';

/** Fecha de Chile en YYYY-MM-DD, opcionalmente desplazada `offsetDays` días. */
export function fechaChile(offsetDays = 0): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  if (!offsetDays) return hoy;
  const [y, m, d] = hoy.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  return dt.toISOString().slice(0, 10);
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
