import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

/**
 * GET /api/dashboard-stats?days=90
 *
 * Agrega los datos REALES de despacho (despacho_rm + despacho_regiones) por día,
 * contando por tipo. Reemplaza la antigua tabla `dispatch_history` (que el flujo
 * actual ya no escribe) como fuente del dashboard de Inicio.
 *
 * Devuelve: { data: [{ date: 'YYYY-MM-DD', total_pallets, total_bultos,
 *             total_contenedores, total_chocolates }] } ordenado por fecha desc.
 */

// La columna `fecha` de despacho_rm/regiones viene como 'dd/mm/yyyy'.
function toISO(fecha: string): string | null {
  const s = (fecha ?? '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); // por si ya viene ISO
  return null;
}

// Clasifica el `tipo` guardado ('Pallet' | 'Bulto' | 'Contenedor' | 'Bulto CH').
function classify(tipo: string): 'pallets' | 'bultos' | 'contenedores' | 'chocolates' {
  const t = (tipo ?? '').toLowerCase();
  if (t.includes('ch')) return 'chocolates';        // 'Bulto CH'
  if (t.startsWith('pall')) return 'pallets';
  if (t.startsWith('cont')) return 'contenedores';
  return 'bultos';
}

interface DayAgg {
  date: string;
  total_pallets: number;
  total_bultos: number;
  total_contenedores: number;
  total_chocolates: number;
}

export async function GET(request: NextRequest) {
  const days = Math.max(1, Math.min(365, Number(new URL(request.url).searchParams.get('days') ?? 90)));
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);

  const sb = supabaseServer();
  const agg: Record<string, DayAgg> = {};

  for (const table of ['despacho_rm', 'despacho_regiones'] as const) {
    const { data, error } = await sb.from(table).select('fecha, tipo').limit(50000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const row of (data ?? []) as { fecha: string; tipo: string }[]) {
      const iso = toISO(row.fecha);
      if (!iso || new Date(iso) < cutoff) continue;
      const day = agg[iso] ?? (agg[iso] = { date: iso, total_pallets: 0, total_bultos: 0, total_contenedores: 0, total_chocolates: 0 });
      const k = classify(row.tipo);
      if (k === 'pallets') day.total_pallets++;
      else if (k === 'contenedores') day.total_contenedores++;
      else if (k === 'chocolates') day.total_chocolates++;
      else day.total_bultos++;
    }
  }

  const rows = Object.values(agg).sort((a, b) => b.date.localeCompare(a.date));
  return NextResponse.json({ data: rows });
}
