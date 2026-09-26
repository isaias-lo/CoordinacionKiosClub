/* ── 2ª vuelta por fecha ──────────────────────────────────────────────────────
   Helpers puros para separar el backlog de 2ª vuelta por FECHA DE ORIGEN, en vez
   de sumar todo por código (que mezclaba, p. ej., 30PHU del 04-ago con el del 06-ago). */

import { norm } from './helpers';

export interface CalDataV2 { on: boolean; p: number; b: number; c: number; ch: number; g?: string }
export interface PendienteOrigen { c: string; p: number; b: number; ch: number; fechaOrigen: string }

/** Fechas de origen distintas del backlog, ascendente (más antigua primero). */
export function fechasBacklogV2(pendientes: { fechaOrigen: string }[]): string[] {
  return [...new Set(pendientes.map(p => p.fechaOrigen).filter(Boolean))].sort();
}

/**
 * Pool de 2ª vuelta para UNA fecha de origen (SIN sumar entre fechas): un registro por código
 * con el conteo de ESE día. Antes se sumaban todas las fechas por código y se perdía el detalle
 * (un 30PHU pendiente el 04 y el 06 aparecía como uno solo con los montos sumados).
 */
export function poolV2ParaFecha(
  pendientes: PendienteOrigen[],
  fecha: string,
  norm: (s: string) => string,
  grpOf: (cod: string) => string,
): Record<string, CalDataV2> {
  const out: Record<string, CalDataV2> = {};
  for (const s of pendientes) {
    if (s.fechaOrigen !== fecha) continue;
    const cod = norm(s.c);
    if (!out[cod]) out[cod] = { on: true, p: 0, b: 0, c: 0, ch: 0, g: grpOf(cod) };
    out[cod].p += s.p; out[cod].b += s.b; out[cod].ch += s.ch;
  }
  return out;
}

/** Total de tiendas pendientes en una fecha (para el badge de la sub-pestaña). */
export function conteoPorFecha(pendientes: { fechaOrigen: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of pendientes) out[p.fechaOrigen] = (out[p.fechaOrigen] ?? 0) + 1;
  return out;
}

/**
 * Los códigos que hay que sacar de las pendientes al cerrar un camión: las de ESA fecha de origen
 * cuyas tiendas van arriba del camión.
 *
 * Devuelve el código **tal como está guardado**, sin normalizar, a propósito: `savePendientesV2`
 * compara contra el `c` que vive en `shared_session_state`, así que devolver el normalizado los
 * dejaría sin casar y la tienda seguiría figurando como pendiente después de despacharla. La
 * normalización se usa solo para COMPARAR.
 */
export function codsDeCierreV2(
  pendientes: { c: string; fechaOrigen: string }[],
  fechaOrigen: string,
  stores: { c: string }[],
): Set<string> {
  const despachados = new Set(stores.map(t => norm(t.c)));
  return new Set(
    pendientes.filter(p => p.fechaOrigen === fechaOrigen && despachados.has(norm(p.c))).map(p => p.c),
  );
}
