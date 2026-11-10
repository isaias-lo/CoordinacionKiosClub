/** Cómo se buscan los manifiestos a reimprimir: por el día que el camión sale o el que se armó. */
export type BuscarPor = 'salida' | 'armado';

/** El día antes o después de una fecha ISO (YYYY-MM-DD). Por UTC al mediodía: sin saltos por horario de verano. */
export function diaVecino(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
