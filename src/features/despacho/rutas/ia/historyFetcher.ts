// Trae el historial real de asignaciones (cómo asignó el coordinador en días pasados) desde
// shared_session_state fuente 'rutas'. Es la señal de aprendizaje in-context del asistente.
// Server-only (usa el cliente de servicio de Supabase).

import type { IAExample } from './types';

// Cliente mínimo que necesitamos (evita acoplar al tipo completo de @supabase/supabase-js).
interface MinimalSb {
  from: (t: string) => {
    select: (c: string) => {
      eq: (col: string, val: string) => {
        order: (col: string, o: { ascending: boolean }) => {
          limit: (n: number) => Promise<{ data: unknown[] | null }>;
        };
      };
    };
  };
}

function isoToDDMM(iso: string): string {
  const [y, m, d] = String(iso).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(iso);
}

/** state 'rutas' = { patente: [{c,p,b,ch}] } → { patente: [cods] }. Tolerante a formas raras. */
function normalizeState(state: unknown): Record<string, string[]> {
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

export async function fetchAsignacionHistory(
  sb: MinimalSb,
  opts: { excludeFecha?: string; limit?: number } = {},
): Promise<IAExample[]> {
  const limit = opts.limit ?? 15;
  const { data } = await sb
    .from('shared_session_state')
    .select('fecha, state')
    .eq('fuente', 'rutas')
    .order('fecha', { ascending: false })
    .limit(limit + 5);
  if (!data) return [];

  const out: IAExample[] = [];
  for (const row of data as { fecha: string; state: unknown }[]) {
    if (opts.excludeFecha && row.fecha === opts.excludeFecha) continue;
    const asignacion = normalizeState(row.state);
    if (Object.keys(asignacion).length) out.push({ fecha: isoToDDMM(row.fecha), asignacion });
    if (out.length >= limit) break;
  }
  return out;
}
