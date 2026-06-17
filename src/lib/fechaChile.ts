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
