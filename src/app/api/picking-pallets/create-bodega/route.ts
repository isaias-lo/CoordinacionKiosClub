import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';

const UNAUTH = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 });

function buildCanonical(tipo: string, seq: number, cod: string, stamp: string): string {
  if (tipo === 'P')  return `P${seq}${cod}${stamp}P`;
  if (tipo === 'B')  return `${seq}B${cod}${stamp}B`;
  if (tipo === 'CH') return `CH${seq}${cod}${stamp}CH`;
  if (tipo === 'C')  return `C${seq}${cod}${stamp}C`;
  return `${seq}${cod}${stamp}`;
}

/**
 * POST /api/picking-pallets/create-bodega
 *
 * Crea un slot de picking originado en BODEGA (no en Picking). Asigna el
 * siguiente seq consecutivo para (date, store_cod, tipo) y su canonical_id,
 * de modo que el ID quede en orden tras los que vienen de Picking y los ya
 * creados. Devuelve el slot completo para vincularlo al form row.
 */
export async function POST(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  try {
    const body = await request.json() as {
      date: string; store_cod: string; tipo: string; contenido?: string;
    };
    if (!body.date || !body.store_cod || !body.tipo) {
      return NextResponse.json({ error: 'date, store_cod y tipo requeridos' }, { status: 400 });
    }

    const sb = supabaseServer();
    const SELECT_COLS = 'id, store_cod, tipo, contenido, seq, canonical_id, peso_kg, alto, largo, ancho, peso_v';

    // [RC-4] Vía ATÓMICA (recomendada): función Postgres con advisory lock que serializa las
    // altas concurrentes del mismo (date, store_cod, tipo) y calcula el seq sin carrera → dos
    // usuarios agregando a la vez ya no crean slots con seq duplicado. Si la función todavía no
    // está desplegada (PGRST202 = no existe), cae al camino viejo para no romper nada.
    const rpc = await sb.rpc('fn_create_bodega_slot', {
      p_date:      body.date,
      p_store_cod: body.store_cod,
      p_tipo:      body.tipo,
      p_contenido: body.contenido ?? 'hogar',
    });
    if (!rpc.error) {
      const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
      if (row) {
        const r = row as Record<string, unknown>;
        return NextResponse.json({ data: {
          id: r.id, store_cod: r.store_cod, tipo: r.tipo, contenido: r.contenido,
          seq: r.seq, canonical_id: r.canonical_id,
          peso_kg: r.peso_kg ?? null, alto: r.alto ?? null, largo: r.largo ?? null,
          ancho: r.ancho ?? null, peso_v: r.peso_v ?? null,
        } });
      }
    } else if (rpc.error.code !== 'PGRST202') {
      // Error real de la función (no "no existe") → reportarlo.
      return NextResponse.json({ error: rpc.error.message }, { status: 500 });
    }

    // Fallback NO atómico (solo hasta que se despliegue la función): seq = activos del tipo + 1.
    const { data: existing } = await sb
      .from('picking_pallets')
      .select('id')
      .eq('date', body.date)
      .eq('store_cod', body.store_cod)
      .eq('tipo', body.tipo)
      .eq('is_active', true);

    const seq = (existing?.length ?? 0) + 1;
    const [yyyy, mm, dd] = body.date.split('-');
    const stamp = `${dd}${mm}${yyyy}`;
    const canonical_id = buildCanonical(body.tipo, seq, body.store_cod, stamp);

    const { data, error } = await sb
      .from('picking_pallets')
      .insert({
        date:         body.date,
        store_cod:    body.store_cod,
        state_key:    `${body.store_cod}__bodega`,
        picker_label: 'Bodega',
        tipo:         body.tipo,
        contenido:    body.contenido ?? 'hogar',
        refs:         '',
        seq,
        canonical_id,
        is_active:    true,
      })
      .select(SELECT_COLS)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
