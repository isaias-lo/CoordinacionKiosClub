import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { buildRows as buildSantiagoRows } from '@/features/despacho/santiago/utils/sheetsSantiago';
import { buildRows as buildRegionesRows } from '@/features/despacho/regiones/utils/sheetsRegiones';
import type { SantiagoItem } from '@/features/despacho/santiago/types';
import type { DispatchItem } from '@/types';

function isCronRequest(req: NextRequest) {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
}

function hasData(state: Record<string, unknown>): boolean {
  const items    = state.items    as Record<string, unknown[]> | undefined;
  const dispatch = state.dispatch as Record<string, unknown[]> | undefined;
  return !!(items    && Object.values(items).some(a => a.length > 0))
      || !!(dispatch && Object.values(dispatch).some(a => a.length > 0));
}

export async function POST(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const sb = supabaseServer();
  const today = new Date().toISOString().split('T')[0];
  const results: string[] = [];

  const { data: sessions } = await sb
    .from('shared_session_state')
    .select('fuente, state')
    .eq('fecha', today)
    .in('fuente', ['santiago', 'regiones']);

  for (const session of sessions ?? []) {
    const state = session.state as Record<string, unknown>;
    if (state.registrado === true || !hasData(state)) continue;

    const fechaDespacho = (state.fechaDespacho as string | undefined) ?? today;
    const sheet = session.fuente === 'santiago' ? 'DESPACHO RM' : 'DESPACHO REGIONES';

    let rows: (string | number)[][] = [];
    if (session.fuente === 'santiago') {
      rows = buildSantiagoRows(
        state.items as Record<string, SantiagoItem[]>,
        (state.regimen as string) ?? 'Seco',
        fechaDespacho,
        today,
      );
    } else {
      rows = buildRegionesRows(
        state.dispatch as Record<string, DispatchItem[]>,
        (state.regimen as string) ?? 'Carga',
        fechaDespacho,
        today,
      );
    }

    if (!rows.length) continue;

    const base = process.env.NEXTAUTH_URL
      ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const res = await fetch(`${base}/api/sheets-write`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ sheet, rows, fuente: `auto_${session.fuente}` }),
    });

    if (res.ok) {
      await sb
        .from('shared_session_state')
        .update({
          state: {
            ...state,
            registrado: true,
            auto_registered: true,
            auto_registered_at: new Date().toISOString(),
          },
        })
        .eq('fecha', today)
        .eq('fuente', session.fuente);
      results.push(`${session.fuente}: ${rows.length} filas auto-registradas`);
    } else {
      console.error(`[auto-register] ${session.fuente} falló:`, await res.text());
    }
  }

  return NextResponse.json({ ok: true, results });
}
