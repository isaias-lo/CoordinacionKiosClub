import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';
import { parseBody, CreatePickingPalletSchema } from '@/lib/schemas';

const SELECT_COLS = 'id, store_cod, state_key, picker_label, tipo, contenido, refs, created_at';
const UNAUTH = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 });

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  const idParam = request.nextUrl.searchParams.get('id');
  if (idParam) {
    const { data, error } = await supabaseServer()
      .from('picking_pallets')
      .select(SELECT_COLS)
      .eq('id', Number(idParam))
      .single();
    if (error) return NextResponse.json({ error: 'ID no encontrado' }, { status: 404 });
    // If refs is empty, look for sibling pallets in the same group (same state_key + date) that have refs
    if (data && !data.refs) {
      const slotDate = (data.created_at as string).slice(0, 10);
      const { data: sibling } = await supabaseServer()
        .from('picking_pallets')
        .select('refs')
        .eq('state_key', data.state_key as string)
        .eq('date', slotDate)
        .neq('refs', '')
        .limit(1)
        .maybeSingle();
      if (sibling?.refs) data.refs = sibling.refs;
    }
    return NextResponse.json({ data });
  }
  const date = request.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseServer()
    .from('picking_pallets')
    .select(SELECT_COLS)
    .eq('date', date)
    .order('created_at', { ascending: true })
    .order('id',          { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  const parsed = parseBody(CreatePickingPalletSchema, await request.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const { data, error } = await supabaseServer()
    .from('picking_pallets')
    .insert({
      date:         body.date,
      store_cod:    body.store_cod,
      state_key:    body.state_key,
      picker_label: body.picker_label,
      tipo:         body.tipo,
      contenido:    body.contenido ?? 'hogar',
      refs:         body.refs ?? '',
    })
    .select(SELECT_COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  const body = await request.json() as
    | { id: number; tipo?: string; contenido?: string }
    | { slots: { id: number; seq: number; canonical_id: string }[] };

  // Batch: asignar seq + canonical_id a múltiples slots al imprimir
  if ('slots' in body) {
    const sb = supabaseServer();
    const errs: string[] = [];
    for (const slot of body.slots) {
      const { error } = await sb
        .from('picking_pallets')
        .update({ seq: slot.seq, canonical_id: slot.canonical_id })
        .eq('id', slot.id)
        .is('canonical_id', null);
      if (error) errs.push(error.message);
    }
    if (errs.length) return NextResponse.json({ error: errs.join('; ') }, { status: 500 });
    return NextResponse.json({ ok: true, updated: body.slots.length });
  }

  const update: Record<string, unknown> = {};
  if (body.tipo      !== undefined) update.tipo      = body.tipo;
  if (body.contenido !== undefined) update.contenido = body.contenido;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  const { error } = await supabaseServer()
    .from('picking_pallets')
    .update(update)
    .eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  const body = await request.json() as { id: number };
  const { error } = await supabaseServer()
    .from('picking_pallets')
    .delete()
    .eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
