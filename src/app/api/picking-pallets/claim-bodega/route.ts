import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';

const UNAUTH = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 });

const SLOT_FIELDS = 'id, store_cod, tipo, contenido, seq, canonical_id, peso_kg, alto, largo, ancho, peso_v, is_active';

/**
 * POST /api/picking-pallets/claim-bodega
 *
 * "Reclama" un pallet YA EXISTENTE (etiquetado en un día anterior / adelantado) para
 * el despacho de HOY. Lo identifica por su `#id` numérico impreso en la etiqueta o por
 * el `canonical_id` que codifica el código de barras.
 *
 * - Bloquea si el pallet pertenece a otra tienda distinta a la seleccionada (reason: 'otra_tienda').
 * - Si coincide, re-data el slot a HOY (conserva store_cod y canonical_id original, así la
 *   etiqueta física sigue siendo válida) y lo reactiva. Devuelve el slot para vincularlo al form row.
 *
 * Body: { ref: string; date: string; store_cod: string }
 */
export async function POST(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  try {
    const body = await request.json() as { ref?: string; date?: string; store_cod?: string };
    const ref = (body.ref ?? '').trim();
    const date = (body.date ?? '').trim();
    const storeCod = (body.store_cod ?? '').trim();
    if (!ref || !date || !storeCod) {
      return NextResponse.json({ error: 'ref, date y store_cod requeridos' }, { status: 400 });
    }

    const sb = supabaseServer();

    // Resolver el slot: numérico → por id; si no → por canonical_id (igual criterio que pallet-lookup).
    let slot: Record<string, unknown> | null = null;
    if (/^\d+$/.test(ref)) {
      const { data } = await sb.from('picking_pallets').select(SLOT_FIELDS).eq('id', Number(ref)).maybeSingle();
      slot = data ?? null;
    }
    if (!slot) {
      const { data } = await sb.from('picking_pallets').select(SLOT_FIELDS).eq('canonical_id', ref).maybeSingle();
      slot = data ?? null;
    }

    if (!slot) {
      return NextResponse.json({ error: 'Pallet no encontrado', reason: 'no_encontrado' }, { status: 404 });
    }

    // Bloquear si es de otra tienda
    if (String(slot.store_cod) !== storeCod) {
      return NextResponse.json(
        { error: 'El pallet pertenece a otra tienda', reason: 'otra_tienda', store_cod: slot.store_cod },
        { status: 409 },
      );
    }

    // Re-datar a hoy (conserva store_cod y canonical_id) + reactivar.
    const { data: updated, error } = await sb
      .from('picking_pallets')
      .update({ date, is_active: true })
      .eq('id', slot.id as number)
      .select(SLOT_FIELDS)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
