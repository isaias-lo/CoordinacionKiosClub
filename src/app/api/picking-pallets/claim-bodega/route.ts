import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';

const UNAUTH = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 });

// `date` y `combined_into` no se devuelven al cliente, pero hacen falta acá: `date` para detectar
// que el pallet YA está en la carga de hoy (si no, se agregaba una segunda fila para el mismo
// pallet físico y Bodega lo contaba dos veces), y `combined_into` para poder limpiarlo al
// reclamar un pallet que había sido sumado a otro.
const SLOT_FIELDS = 'id, store_cod, tipo, contenido, seq, canonical_id, peso_kg, alto, largo, ancho, peso_v, is_active, date, combined_into';

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
      // No está en `picking_pallets`, pero eso NO significa que el número esté mal: el borrado es
      // físico (la fila desaparece), así que el caso más común es que alguien lo haya eliminado.
      // El único rastro queda en `picking_eventos` — sin mirar ahí, el mensaje mandaba a revisar
      // una etiqueta que estaba perfecta.
      const borrado = /^\d+$/.test(ref)
        ? (await sb
            .from('picking_eventos')
            .select('created_at, actor_name, tipo, store_cod')
            .eq('event_type', 'eliminar')
            .eq('pallet_id', Number(ref))
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()).data
        : null;

      if (borrado) {
        return NextResponse.json({
          error: 'Pallet eliminado', reason: 'eliminado',
          eliminado_en: borrado.created_at,
          // Viene vacío en la mayoría de los borrados; el cliente ya lo contempla.
          eliminado_por: borrado.actor_name ?? null,
          tipo: borrado.tipo ?? null,
        }, { status: 404 });
      }
      return NextResponse.json({ error: 'Pallet no encontrado', reason: 'no_encontrado' }, { status: 404 });
    }

    // Bloquear si es de otra tienda
    if (String(slot.store_cod) !== storeCod) {
      return NextResponse.json(
        { error: 'El pallet pertenece a otra tienda', reason: 'otra_tienda', store_cod: slot.store_cod },
        { status: 409 },
      );
    }

    // Ya está en la carga de hoy: reclamarlo otra vez agregaría una SEGUNDA fila para el mismo
    // pallet físico, y Bodega lo contaría dos veces. Un pallet absorbido por otro (combined_into)
    // no cuenta como presente — ese sí se puede recuperar, que es justo lo que se pedía.
    if (String(slot.date ?? '') === date && slot.is_active === true && slot.combined_into == null) {
      return NextResponse.json(
        { error: 'El pallet ya está en la carga de hoy', reason: 'ya_en_carga' },
        { status: 409 },
      );
    }

    // Re-datar a hoy (conserva store_cod y canonical_id) + reactivar.
    // `combined_into: null` lo desata del pallet que lo había absorbido: sin esto el pallet
    // revivía pero seguía marcado como "parte de otro", que es la mitad del "no deja" reportado.
    const { data: updated, error } = await sb
      .from('picking_pallets')
      .update({ date, is_active: true, combined_into: null })
      .eq('id', slot.id as number)
      .select(SLOT_FIELDS)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
