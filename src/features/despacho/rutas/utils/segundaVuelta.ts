// Deriva las pendientes de 2ª vuelta desde la FUENTE DE VERDAD: los registros de despacho
// (despacho_rm / despacho_regiones) que quedaron SIN patente en días pasados = no salieron →
// pendientes reales. Auto-sanante: al cerrar el camión de 2ª vuelta se les pone patente y
// desaparecen solas del pool. Sin tabla de seguimiento aparte que se desincronice.
//
// Cada fila de despacho es UNA unidad (tipo = Pallet | Bulto | Bulto CH | Chocolate | Contenedor).
// Se agrupa por (cod, fecha) contando p/b/ch. `grupo` viene de la tabla origen (regiones → 'fal')
// para que el registro de vuelta caiga en la tabla correcta.

import type { Grupo } from './vueltaRegistro';

export interface DespachoUnitRow { cod: string; fecha: string; tipo: string | null } // fecha = DD/MM/YYYY

export interface PendienteDerivada {
  c: string;
  p: number;
  b: number;
  ch: number;
  fechaOrigen: string;   // YYYY-MM-DD
  grupo: Grupo;
}

const DDMM = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** DD/MM/YYYY → YYYY-MM-DD (null si el formato no calza). */
export function ddmmToISO(f: string): string | null {
  const m = DDMM.exec(f.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Clasifica el tipo de unidad en p (pallet/contenedor), ch (chocolate) o b (bulto). */
function bump(acc: { p: number; b: number; ch: number }, tipo: string | null): void {
  const t = (tipo ?? '').trim();
  if (t === 'Pallet' || t === 'Contenedor') acc.p++;
  else if (/ch/i.test(t) || t === 'Chocolate') acc.ch++;      // 'Bulto CH', 'Chocolate'
  else if (t === 'Bulto') acc.b++;
  // otros tipos desconocidos se ignoran (no rompen el conteo)
}

/**
 * Agrupa filas de despacho SIN patente por (cod, fecha) → pendientes de 2ª vuelta. Solo días
 * PASADOS (nunca hoy: hoy es 1ª vuelta). Omite fechas mal formadas y pendientes con conteo cero.
 * La query que alimenta esto ya acota la(s) fecha(s); acá solo se agrupa/cuenta.
 */
export function derivarPendientesV2(
  rows: DespachoUnitRow[],
  grupo: Grupo,
  todayISO: string,
): PendienteDerivada[] {
  const map = new Map<string, PendienteDerivada>();
  for (const r of rows) {
    const iso = ddmmToISO(r.fecha ?? '');
    if (!iso || iso >= todayISO) continue; // solo días pasados
    const key = `${r.cod}::${iso}`;
    const cur = map.get(key) ?? { c: r.cod, p: 0, b: 0, ch: 0, fechaOrigen: iso, grupo };
    bump(cur, r.tipo);
    map.set(key, cur);
  }
  return [...map.values()].filter(x => x.p > 0 || x.b > 0 || x.ch > 0);
}
