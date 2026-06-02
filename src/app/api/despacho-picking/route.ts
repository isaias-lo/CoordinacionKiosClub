import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';
import { getTiendaSantiagoByCod } from '@/features/despacho/santiago/data/tiendasSantiago';

const URBAN_COMMUNES = new Set([
  'Santiago', 'Providencia', 'Las Condes', 'Vitacura', 'Ñuñoa',
  'Maipú', 'La Florida', 'Quilicura', 'Huechuraba', 'La Reina',
  'Lo Barnechea', 'Puente Alto',
]);

const CARGA_LABEL: Record<string, string> = {
  comida:    'Comida',
  hogar:     'Hogar',
  mixto:     'Mixto',
  chocolate: 'Chocolate',
  aseo:      'Aseo',
};

function stampFromISO(isoDate: string): string {
  const [yyyy, mm, dd] = isoDate.split('-');
  return `${dd}${mm}${yyyy}`;
}

function fechaFromISO(isoDate: string): string {
  const [yyyy, mm, dd] = isoDate.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

function canonicalId(tipo: string, seq: number, cod: string, stamp: string): string {
  if (tipo === 'P')  return `P${seq}${cod}${stamp}P`;
  if (tipo === 'B')  return `${seq}B${cod}${stamp}B`;
  if (tipo === 'CH') return `CH${seq}${cod}${stamp}CH`;
  if (tipo === 'C')  return `C${seq}${cod}${stamp}C`;
  return `${seq}${cod}${stamp}`;
}

function tipoLabel(tipo: string): string {
  if (tipo === 'P')  return 'Pallet';
  if (tipo === 'B')  return 'Bulto';
  if (tipo === 'CH') return 'Bulto CH';
  if (tipo === 'C')  return 'Contenedor';
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
      .select('id')
      .eq('date', date)
      .eq('store_cod', store_cod)
      .eq('tipo', tipo)
      .order('id', { ascending: true });

    const slotList = slots ?? [];
    const rank = slotList.findIndex(s => s.id === slot_id) + 1;
    if (rank === 0) {
      return NextResponse.json({ error: 'slot_id not found for this store/tipo/date' }, { status: 404 });
    }

    const stamp  = stampFromISO(date);
    const fecha  = fechaFromISO(date);
    const id     = canonicalId(tipo, rank, store_cod, stamp);
    const tienda = getTiendaSantiagoByCod(store_cod);

    const record = {
      id,
      fecha,
      cod:             store_cod,
      tienda:          tienda?.tienda ?? store_cod,
      tipo:            tipoLabel(tipo),
      carga:           CARGA_LABEL[contenido] ?? contenido,
      region:          tienda?.region ?? 'RM',
      comuna:          tienda?.comuna ?? '',
      tipo_comuna:     tienda ? (URBAN_COMMUNES.has(tienda.comuna) ? 'Urbano' : 'Extraurbano') : 'Urbano',
      estado:          'En picking',
      n_pallet_bulto:  String(rank),
      seguimiento:     'Registrado',
      fuente:          'picking',
      picking_slot_id: slot_id,
    };

    // Insert only if ID doesn't already exist — never overwrite Bodega/Enrutador data
    const { error } = await sb
      .from('despacho_rm')
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
