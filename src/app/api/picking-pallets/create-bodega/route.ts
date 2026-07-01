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
    const [yyyy, mm, dd] = body.date.split('-');
    const stamp = `${dd}${mm}${yyyy}`;

    // El índice único (date, store_cod, tipo, seq) WHERE is_active rechaza seq duplicados.
    // Al agregar CH rápido, varias requests calculaban el MISMO seq (read-then-insert no atómico)
    // → los inserts fallaban y los CH "no se agregaban". Reintentamos: recalculamos el siguiente
    // seq (max+1, robusto ante slots sin seq) y reinsertamos si hay conflicto de unicidad.
    const MAX_RETRIES = 8;
    let lastError: { message: string } | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const { data: top } = await sb
        .from('picking_pallets')
        .select('seq')
        .eq('date', body.date)
        .eq('store_cod', body.store_cod)
        .eq('tipo', body.tipo)
        .eq('is_active', true)
        .not('seq', 'is', null)
        .order('seq', { ascending: false })
        .limit(1);

      const seq = ((top?.[0]?.seq as number | undefined) ?? 0) + 1;
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
        .select('id, store_cod, tipo, contenido, seq, canonical_id, peso_kg, alto, largo, ancho, peso_v')
        .single();

      if (!error) return NextResponse.json({ data });

      // 23505 = unique_violation → otro request tomó este seq; recalcular y reintentar.
      lastError = error;
      if (error.code !== '23505') break;
    }

    return NextResponse.json({ error: lastError?.message ?? 'No se pudo crear el slot' }, { status: 500 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
