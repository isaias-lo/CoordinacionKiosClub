import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { parseOrigin, isAbastecimientoOp } from '@/features/picking/picking-utils';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TIPO     = 'odoo-progress';
const META_KEY = '__odoo_refresh__';   // fila de control: guarda el timestamp del último refresco a Odoo
const TTL_MS   = 60_000;               // refresco batch automático: como máximo 1 por minuto (compartido entre todos)

/**
 * Llama UNA vez a Odoo (vía el proxy server-side `/api/odoo`, que usa las
 * credenciales de entorno) y calcula el progreso {total, done} por tienda.
 * Devuelve null si Odoo falla → el caller usa la caché previa (best-effort).
 */
async function fetchOdooProgress(request: NextRequest): Promise<Record<string, { total: number; done: number }> | null> {
  try {
    const res = await fetch(new URL('/api/odoo', request.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // query vacío = TODAS las tiendas del día en una sola llamada batch
      body: JSON.stringify({ action: 'picking_today_operations', query: '' }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { pickings?: Array<{ origin: string; state: string }>; error?: string };
    if (data.error || !data.pickings) return null;

    const acc: Record<string, { total: number; done: number }> = {};
    for (const p of data.pickings) {
      const origin = p.origin ?? '';
      // Mismo filtro que usa Picking al cargar ops por tienda
      if (!isAbastecimientoOp(origin) || origin.toUpperCase().startsWith('AUDITORIA')) continue;
      const { storeCode } = parseOrigin(origin);
      if (!storeCode) continue;
      if (!acc[storeCode]) acc[storeCode] = { total: 0, done: 0 };
      acc[storeCode].total += 1;
      if (p.state === 'done') acc[storeCode].done += 1;
    }
    return acc;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') ?? todayISO();
  const sb   = supabaseServer();

  const { data, error } = await sb
    .from('picking_session_state')
    .select('state_key, picker_label, updated_at')
    .eq('date', date)
    .eq('tipo', TIPO);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = data ?? [];

  // ── Refresco perezoso y throttleado ──────────────────────────────────────
  // Solo para el día de hoy. Si la caché está vieja (> TTL), hace 1 llamada
  // batch a Odoo y actualiza la tabla. El "candado" es la fila META: se reclama
  // ANTES de llamar a Odoo para que peticiones concurrentes no disparen en
  // paralelo. Así, aunque haya N asistentes mirando bodegas, es máx 1 llamada/min.
  if (date === todayISO()) {
    const metaRow = rows.find(r => r.state_key === META_KEY);
    let lastTs = 0;
    try { lastTs = (JSON.parse(metaRow?.picker_label ?? '{}') as { ts?: number }).ts ?? 0; } catch { /* noop */ }

    // Refresco automático: solo si la caché está vieja (> TTL)
    if (Date.now() - lastTs > TTL_MS) {
      // Reclamar la ventana (optimista) antes de la llamada lenta
      await sb.from('picking_session_state').upsert(
        { state_key: META_KEY, date, tipo: TIPO, picker_label: JSON.stringify({ ts: Date.now() }), updated_at: new Date().toISOString() },
        { onConflict: 'state_key,date' },
      );

      const fresh = await fetchOdooProgress(request);
      if (fresh) {
        const upRows = Object.entries(fresh).map(([cod, v]) => ({
          state_key:    cod,
          date,
          tipo:         TIPO,
          picker_label: JSON.stringify({ total: v.total, done: v.done }),
          updated_at:   new Date().toISOString(),
        }));
        if (upRows.length) {
          await sb.from('picking_session_state').upsert(upRows, { onConflict: 'state_key,date' });
        }
        // Reflejar lo fresco en la respuesta (merge sobre lo leído)
        const map = new Map(rows.map(r => [r.state_key, r as typeof rows[number]]));
        for (const r of upRows) map.set(r.state_key, r);
        rows = Array.from(map.values());
      }
    }
  }

  const result: Record<string, { total: number; done: number; status: string }> = {};
  for (const row of rows) {
    if (row.state_key.startsWith('__')) continue;   // saltar filas de control (META)
    try {
      const parsed = JSON.parse(row.picker_label) as { total: number; done: number };
      const status = parsed.total === 0 ? 'none' : parsed.done === parsed.total ? 'complete' : 'partial';
      result[row.state_key] = { ...parsed, status };
    } catch { /* skip malformed */ }
  }
  return NextResponse.json({ stores: result });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    stores: Array<{ cod: string; total: number; done: number }>;
  };
  const date = todayISO();
  if (!body.stores?.length) return NextResponse.json({ ok: true });

  const rows = body.stores.map(s => ({
    state_key: s.cod,
    date,
    picker_label: JSON.stringify({ total: s.total, done: s.done }),
    tipo: TIPO,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseServer()
    .from('picking_session_state')
    .upsert(rows, { onConflict: 'state_key,date' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
