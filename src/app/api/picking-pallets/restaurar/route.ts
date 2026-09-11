import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyActor } from '@/lib/apiAuth';
import { filaParaRestaurar, puedeRestaurar } from '@/features/despacho/shared/restaurarPallet';

const UNAUTH = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 });

// Lo mismo que devuelve claim-bodega, para que el diálogo trate una restauración igual que un
// reclamo exitoso: ni el formulario de RM/Costa ni el de Nacional tienen que saber la diferencia.
const SLOT_FIELDS = 'id, store_cod, tipo, contenido, seq, canonical_id, peso_kg, alto, largo, ancho, peso_v, is_active, date, combined_into';

/**
 * POST /api/picking-pallets/restaurar
 *
 * Devuelve un pallet BORRADO a la carga de hoy, tal como estaba al borrarse: su mismo id (y con él
 * su #número y su historial), su número de etiqueta, su código de barras, su peso y sus medidas.
 * Sale de la copia que guarda el trigger de auditoría en picking_eventos.datos (ver
 * sql/2026-09-11_restaurar_pallet_borrado.sql). Es el "Revertir" para después de los 7 s del snackbar.
 *
 * Body: { pallet_id: number; date: string; store_cod: string }
 */
export async function POST(request: NextRequest) {
  const actor = await verifyActor(request);
  if (!actor) return UNAUTH();
  try {
    const body = await request.json() as { pallet_id?: number; date?: string; store_cod?: string };
    const id = Number(body.pallet_id);
    const date = String(body.date ?? '').trim();
    const storeCod = String(body.store_cod ?? '').trim();
    if (!Number.isInteger(id) || id <= 0 || !date || !storeCod) {
      return NextResponse.json({ error: 'pallet_id, date y store_cod requeridos' }, { status: 400 });
    }

    const sb = supabaseServer();

    // Si ya existe, alguien lo restauró (o nunca se borró): no hay nada que devolver. El cliente lo
    // puede reclamar como cualquier preexistente.
    const { data: existe } = await sb.from('picking_pallets').select('id').eq('id', id).maybeSingle();
    if (existe) {
      return NextResponse.json({ error: 'El pallet ya existe', reason: 'ya_existe' }, { status: 409 });
    }

    const { data: ev } = await sb
      .from('picking_eventos')
      .select('datos')
      .eq('event_type', 'eliminar')
      .eq('pallet_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const copia = (ev as { datos?: Record<string, unknown> | null } | null)?.datos ?? null;

    const puede = puedeRestaurar(copia, storeCod);
    if (!puede.ok) {
      return NextResponse.json(
        { error: puede.motivo === 'otra_tienda' ? 'El pallet es de otra tienda' : 'Este borrado no guardó copia', reason: puede.motivo },
        { status: puede.motivo === 'otra_tienda' ? 409 : 404 },
      );
    }

    const fila = filaParaRestaurar(copia, date);
    if (!fila) return NextResponse.json({ error: 'La copia está incompleta', reason: 'sin_copia' }, { status: 422 });

    const { data: slot, error } = await sb.from('picking_pallets').insert(fila).select(SLOT_FIELDS).single();
    if (error) {
      // Dos personas restaurando a la vez: la segunda choca con la clave primaria.
      if (error.code === '23505') return NextResponse.json({ error: 'El pallet ya existe', reason: 'ya_existe' }, { status: 409 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Queda en la línea de tiempo del pallet: crear → eliminar → restaurar.
    await sb.from('picking_eventos').insert({
      date, event_type: 'restaurar', pallet_id: id,
      state_key: fila.state_key ?? null, store_cod: fila.store_cod, tipo: fila.tipo,
      picker_label: fila.picker_label ?? null, actor_name: actor.name,
    });

    return NextResponse.json({ data: slot });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
