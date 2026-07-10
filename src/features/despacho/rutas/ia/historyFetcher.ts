// Trae el historial real de asignaciones (cómo asignó el coordinador en días pasados) desde
// Supabase. Es la señal de aprendizaje in-context del asistente. Server-only.
//
// Dos fuentes, más señal = mejores propuestas:
//  1) shared_session_state fuente 'rutas'  → la asignación manual del coordinador (mejor señal).
//  2) historial_despacho.resumen           → lo efectivamente registrado por día (respaldo/complemento).
// Se combinan por fecha (gana 'rutas' si existe para ese día) y se toman los últimos N.

import type { IAExample } from './types';

// Builder mínimo y encadenable (soporta select().eq().order().limit() y select().order().limit()).
interface SbFilter {
  eq: (col: string, val: string) => SbFilter;
  order: (col: string, o: { ascending: boolean }) => SbFilter;
  limit: (n: number) => Promise<{ data: unknown[] | null }>;
}
interface MinimalSb { from: (t: string) => { select: (c: string) => SbFilter } }

function isoToDDMM(iso: string): string {
  const [y, m, d] = String(iso).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(iso);
}

/** state 'rutas' = { patente: [{c,p,b,ch}] } → { patente: [cods] }. */
function normalizeRutasState(state: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!state || typeof state !== 'object') return out;
  for (const [pat, arr] of Object.entries(state as Record<string, unknown>)) {
    if (!Array.isArray(arr)) continue;
    const cods = arr
      .map(s => (s && typeof s === 'object' ? String((s as { c?: unknown }).c ?? '') : ''))
      .filter(Boolean);
    if (cods.length) out[pat] = cods;
  }
  return out;
}

/** historial_despacho.resumen = [{patente, tiendas:[cods], ...}] → { patente: [cods] }. */
function normalizeResumen(resumen: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!Array.isArray(resumen)) return out;
  for (const r of resumen) {
    if (!r || typeof r !== 'object') continue;
    const pat = String((r as { patente?: unknown }).patente ?? '');
    const tiendas = (r as { tiendas?: unknown }).tiendas;
    if (!pat || !Array.isArray(tiendas)) continue;
    const cods = tiendas.map(String).filter(Boolean);
    if (cods.length) out[pat] = cods;
  }
  return out;
}

/** jsonb { patente: [cods] } (p. ej. la columna `final` del feedback) → Record<string,string[]>. */
function normalizeAsignacion(v: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [pat, cods] of Object.entries(v as Record<string, unknown>)) {
    if (!Array.isArray(cods)) continue;
    const c = cods.map(String).filter(Boolean);
    if (c.length) out[pat] = c;
  }
  return out;
}

export async function fetchAsignacionHistory(
  sb: MinimalSb,
  opts: { excludeFecha?: string; limit?: number } = {},
): Promise<IAExample[]> {
  const limit = opts.limit ?? 20;

  // Mapa fecha(ISO) → asignación. Prioridad: feedback IA (ajuste final real) > 'rutas' (manual del
  // coordinador) > historial_despacho (respaldo). El primero que setea una fecha gana.
  const porFecha = new Map<string, Record<string, string[]>>();

  // 0) ia_asignacion_feedback: la asignación FINAL que el coordinador realmente usó (mejor señal).
  try {
    const { data } = await sb
      .from('ia_asignacion_feedback')
      .select('fecha, final')
      .order('created_at', { ascending: false })
      .limit(limit + 8);
    for (const row of (data ?? []) as { fecha: string; final: unknown }[]) {
      if (opts.excludeFecha && row.fecha === opts.excludeFecha) continue;
      if (porFecha.has(row.fecha)) continue;
      const a = normalizeAsignacion(row.final);
      if (Object.keys(a).length) porFecha.set(row.fecha, a);
    }
  } catch { /* opcional: sigue con 'rutas' */ }

  // 1) shared_session_state 'rutas': la asignación manual del coordinador.
  try {
    const { data } = await sb
      .from('shared_session_state')
      .select('fecha, state')
      .eq('fuente', 'rutas')
      .order('fecha', { ascending: false })
      .limit(limit + 8);
    for (const row of (data ?? []) as { fecha: string; state: unknown }[]) {
      if (opts.excludeFecha && row.fecha === opts.excludeFecha) continue;
      if (porFecha.has(row.fecha)) continue; // ya hay feedback para ese día (mejor señal)
      const a = normalizeRutasState(row.state);
      if (Object.keys(a).length) porFecha.set(row.fecha, a);
    }
  } catch { /* sigue con historial_despacho */ }

  try {
    const { data } = await sb
      .from('historial_despacho')
      .select('fecha, resumen')
      .order('fecha', { ascending: false })
      .limit(limit + 8);
    for (const row of (data ?? []) as { fecha: string; resumen: unknown }[]) {
      if (opts.excludeFecha && row.fecha === opts.excludeFecha) continue;
      if (porFecha.has(row.fecha)) continue; // ya tenemos 'rutas' para ese día
      const a = normalizeResumen(row.resumen);
      if (Object.keys(a).length) porFecha.set(row.fecha, a);
    }
  } catch { /* opcional */ }

  return [...porFecha.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // fecha ISO desc
    .slice(0, limit)
    .map(([fecha, asignacion]) => ({ fecha: isoToDDMM(fecha), asignacion }));
}
