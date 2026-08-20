import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth, verifyActor } from '@/lib/apiAuth';
import { parseBody, CreatePickingPalletSchema } from '@/lib/schemas';

const SELECT_COLS = 'id, store_cod, state_key, picker_label, tipo, contenido, section, refs, created_at, seq, canonical_id';
const UNAUTH = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 });

// Auditoría de altas/bajas de pallets (fire-and-forget — no debe bloquear la respuesta).
// Permite ver en Monitoreo quién creó y luego eliminó un pallet/bulto/contenedor.
function logEvento(ev: {
  date?: string; event_type: 'crear' | 'eliminar'; pallet_id: number;
  state_key?: string; store_cod?: string; tipo?: string;
  picker_label?: string; actor_name?: string;
}) {
  supabaseServer()
    .from('picking_eventos')
    .insert({
      date:         ev.date ?? new Date().toISOString().slice(0, 10),
      event_type:   ev.event_type,
      pallet_id:    ev.pallet_id,
      state_key:    ev.state_key ?? null,
      store_cod:    ev.store_cod ?? null,
      tipo:         ev.tipo ?? null,
      picker_label: ev.picker_label ?? null,
      actor_name:   ev.actor_name ?? null,
    })
    .then(({ error }) => { if (error) console.error('[picking-eventos]', error.message); });
}

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
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .order('id',          { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const actor = await verifyActor(request);
  if (!actor) return UNAUTH();
  const parsed = parseBody(CreatePickingPalletSchema, await request.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  // Atribución = usuario del JWT (fuente de verdad); el actor_name del cliente es
  // solo respaldo si el JWT no trae nombre real (degradó al id).
  const actorName = actor.name !== actor.id ? actor.name : (body.actor_name?.trim() || actor.name);

  const sb = supabaseServer();
  const { data, error } = await sb
    .from('picking_pallets')
    .insert({
      date:         body.date,
      store_cod:    body.store_cod,
      state_key:    body.state_key,
      picker_label: body.picker_label,
      tipo:         body.tipo,
      contenido:    body.contenido ?? 'hogar',
      section:      body.section ?? null,
      refs:         body.refs ?? '',
      client_op_id: body.client_op_id ?? null,
    })
    .select(SELECT_COLS)
    .single();

  if (error) {
    // Idempotencia: si ya existe un slot con el mismo client_op_id (reintento /
    // replay de cola offline / doble-click), devolver el existente sin duplicar.
    if (error.code === '23505' && body.client_op_id) {
      const { data: existing } = await sb
        .from('picking_pallets')
        .select(SELECT_COLS)
        .eq('client_op_id', body.client_op_id)
        .maybeSingle();
      if (existing) return NextResponse.json({ data: existing, idempotent: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logEvento({
    date: body.date, event_type: 'crear', pallet_id: data.id as number,
    state_key: body.state_key, store_cod: body.store_cod, tipo: body.tipo,
    picker_label: body.picker_label, actor_name: actorName,
  });
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
    const results = await Promise.all(
      body.slots.map(slot =>
        sb.from('picking_pallets')
          .update({ seq: slot.seq, canonical_id: slot.canonical_id })
          .eq('id', slot.id)
          .is('canonical_id', null)
      )
    );
    const errs = results.filter(r => r.error).map(r => r.error!.message);
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
  const actor = await verifyActor(request);
  if (!actor) return UNAUTH();
  const body = await request.json() as { id: number; actor_name?: string };
  const sb = supabaseServer();
  // Limpiar despacho_rm huérfano antes de borrar el slot — evita filas fantasma
  await sb.from('despacho_rm').delete().eq('picking_slot_id', body.id);
  // Borrar vía RPC que setea el actor en la transacción: el trigger AFTER DELETE
  // registra el evento 'eliminar' (única fuente; cubre también borrados manuales).
  const actorName = actor.name !== actor.id ? actor.name : (body.actor_name?.trim() || actor.name);
  const { error } = await sb.rpc('fn_delete_picking_pallet', { p_id: body.id, p_actor: actorName });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
