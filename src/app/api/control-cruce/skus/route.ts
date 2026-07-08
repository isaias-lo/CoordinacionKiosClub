import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';

const TABLE = 'control_cruce_skus';

// GET /api/control-cruce/skus?picking_name=XXX&detalle=YYY
// GET /api/control-cruce/skus?action=counts&picking_names=[...]
export async function GET(req: NextRequest) {
  if (!(await verifyAuth(req))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const action = req.nextUrl.searchParams.get('action');

  // ── counts: conteo bulk por picking+detalle ──
  if (action === 'counts') {
    const raw = req.nextUrl.searchParams.get('picking_names');
    if (!raw) return NextResponse.json({ error: 'picking_names requerido' }, { status: 400 });
    let names: string[];
    try { names = JSON.parse(raw); } catch { return NextResponse.json({ error: 'picking_names inválido' }, { status: 400 }); }

    const { data, error } = await supabaseServer()
      .from(TABLE).select('picking_name, detalle').in('picking_name', names);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const counts: Record<string, number> = {};
    for (const row of (data ?? [])) {
      const key = `${row.picking_name}|${row.detalle}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return NextResponse.json({ counts });
  }

  // ── default: listar SKUs de un picking+detalle ──
  const pickingName = req.nextUrl.searchParams.get('picking_name');
  const detalle     = req.nextUrl.searchParams.get('detalle') ?? '';
  if (!pickingName) {
    return NextResponse.json({ error: 'picking_name requerido' }, { status: 400 });
  }

  const { data, error } = await supabaseServer()
    .from(TABLE)
    .select('id, picking_name, detalle, sku, created_at')
    .eq('picking_name', pickingName)
    .eq('detalle', detalle)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/control-cruce/skus  { action: 'counts', picking_names: string[] }
// POST /api/control-cruce/skus  { picking_name, detalle, sku }
export async function POST(req: NextRequest) {
  if (!(await verifyAuth(req))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await req.json() as { action?: string; picking_names?: string[]; picking_name?: string; detalle?: string; sku?: string };

  // ── counts via POST (evita overflow de URL con muchos pickings) ──
  if (body.action === 'counts') {
    const names = body.picking_names;
    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ counts: {} });
    }
    const { data, error } = await supabaseServer()
      .from(TABLE).select('picking_name, detalle').in('picking_name', names);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const counts: Record<string, number> = {};
    for (const row of (data ?? [])) {
      const key = `${row.picking_name}|${row.detalle}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return NextResponse.json({ counts });
  }

  if (!body.picking_name || !body.sku?.trim()) {
    return NextResponse.json({ error: 'picking_name y sku requeridos' }, { status: 400 });
  }

  const { data, error } = await supabaseServer()
    .from(TABLE)
    .insert({
      picking_name: body.picking_name,
      detalle:      body.detalle ?? '',
      sku:          body.sku.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/control-cruce/skus  { id }
export async function DELETE(req: NextRequest) {
  if (!(await verifyAuth(req))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await req.json() as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: 'id requerido' }, { status: 400 });
  }

  const { error } = await supabaseServer()
    .from(TABLE)
    .delete()
    .eq('id', body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
