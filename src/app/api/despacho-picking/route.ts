import { canonicalDeSlot, stampDesdeISO } from '@/lib/canonicalSlot';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';
import { getTiendaSantiagoByCod } from '@/features/despacho/santiago/data/tiendasSantiago';
import { destinoDeLaFila } from './destinoDeLaFila';


const CARGA_LABEL: Record<string, string> = {
  comida:     'Comida',
  hogar:      'Hogar',
  mixto:      'Mixto',
  chocolate:  'Chocolate',
  aseo:       'Aseo',
  // Las mezclas que escribe Picking (categoriesToContenido).
  'comida-aseo': 'Comida-Aseo',
  'aseo-hogar':  'Hogar-Aseo',
  completo:      'Comida-Hogar-Aseo',
  congelados: 'Congelados',
};


function fechaFromISO(isoDate: string): string {
  const [yyyy, mm, dd] = isoDate.split('-');
  return `${dd}/${mm}/${yyyy}`;
}


function tipoLabel(tipo: string): string {
  if (tipo === 'P')  return 'Pallet';
  if (tipo === 'B')  return 'Bulto';
  if (tipo === 'CH') return 'Bulto CH';
  if (tipo === 'C')  return 'Contenedor';
  if (tipo === 'CC') return 'Caja Cartón';
  if (tipo === 'CN') return 'Caja Negra';
  return tipo;
}

export async function POST(request: NextRequest) {
  if (!await verifyAuth(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const { slot_id, store_cod, tipo, contenido, date } = await request.json() as {
      slot_id:   number;
      store_cod: string;
      tipo:      string;  // 'P' | 'B' | 'CH' | 'C'
      contenido: string;
      date:      string;  // ISO: YYYY-MM-DD
    };

    const sb = supabaseServer();

    // Determine the rank (1-based) of this slot among all slots of same store/tipo today.
    // This rank becomes the sequence number in the canonical ID.
    const { data: slots } = await sb
      .from('picking_pallets')
      .select('id, seq')
      .eq('date', date)
      .eq('store_cod', store_cod)
      .eq('tipo', tipo)
      .order('id', { ascending: true });

    const slotList = (slots ?? []) as { id: number; seq: number | null }[];
    const pos = slotList.findIndex(s => s.id === slot_id);
    if (pos === -1) {
      return NextResponse.json({ error: 'slot_id not found for this store/tipo/date' }, { status: 404 });
    }
    // El número impreso (`seq`) cuando ya lo tiene; si no, la posición. Solo con la posición, al
    // borrarse un pallet el siguiente repetía el id de otro y el upsert lo descartaba en silencio.
    const rank = slotList[pos].seq ?? pos + 1;

    const stamp  = stampDesdeISO(date);
    const fecha  = fechaFromISO(date);
    const id     = canonicalDeSlot(tipo, rank, store_cod, stamp);
    // La tienda sale de la BD, que es la unica que las conoce a todas; el catalogo estatico de
    // Santiago queda de respaldo. Antes mandaba el estatico y una tienda de Region salia con el
    // CODIGO por nombre y region 'RM' — y en la tabla de RM. Ver `destinoDeLaFila.ts`.
    const { data: filaTienda } = await sb
      .from('tiendas')
      .select('nombre, region, sector_comuna')
      .eq('codigo', store_cod)
      .maybeSingle();
    const destino = destinoDeLaFila(store_cod, filaTienda, getTiendaSantiagoByCod(store_cod));

    const record = {
      id,
      fecha,
      cod:             store_cod,
      tienda:          destino.tienda,
      tipo:            tipoLabel(tipo),
      carga:           CARGA_LABEL[contenido] ?? contenido,
      region:          destino.region,
      comuna:          destino.comuna,
      tipo_comuna:     destino.tipo_comuna,
      estado:          'En picking',
      n_pallet_bulto:  String(rank),
      seguimiento:     'Registrado',
      fuente:          'picking',
      picking_slot_id: slot_id,
    };

    // Si el id ya es de OTRA unidad, el upsert de abajo no escribiría nada y respondería ok.
    const { data: yaEsta } = await sb.from(destino.tabla).select('picking_slot_id').eq('id', id).maybeSingle();
    if (yaEsta && yaEsta.picking_slot_id != null && Number(yaEsta.picking_slot_id) !== slot_id) {
      console.error(`[despacho-picking] ${id} ya es de la unidad ${yaEsta.picking_slot_id}, no de ${slot_id}`);
      return NextResponse.json({ error: 'Ese número ya es de otra unidad', id }, { status: 409 });
    }

    // Insert only if ID doesn't already exist — never overwrite Bodega/Enrutador data
    const { error } = await sb
      .from(destino.tabla)
      .upsert(record, { onConflict: 'id', ignoreDuplicates: true });

    if (error) {
      console.error('[despacho-picking] upsert error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[despacho-picking]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
