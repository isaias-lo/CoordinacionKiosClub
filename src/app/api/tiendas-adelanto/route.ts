import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';

const UNAUTH = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 });

const FIELDS = 'id, fecha, store_cod, zona, tipo, fecha_despacho, creado_por, created_at';
const ZONAS = new Set(['rm', 'costa', 'fal']);

/**
 * /api/tiendas-adelanto — tiendas extra ("adelanto") que Coordinación agrega al
 * flujo de un día sin tocar el calendario central. Las consumen Picking y las
 * Bodegas (Santiago/Regiones) fusionándolas con el calendario.
 *
 * GET    ?fecha=YYYY-MM-DD            → lista las tiendas de adelanto de esa fecha
 * POST   { fecha, store_cod, zona, tipo?, fecha_despacho?, creado_por? } → agrega/actualiza
 * DELETE ?id=NN                       → elimina una
 */
export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  const fecha = new URL(request.url).searchParams.get('fecha');
  if (!fecha) return NextResponse.json({ error: 'fecha requerida' }, { status: 400 });

  const { data, error } = await supabaseServer()
    .from('tiendas_adelanto')
    .select(FIELDS)
    .eq('fecha', fecha)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  try {
    const body = await request.json() as {
      fecha?: string; store_cod?: string; zona?: string;
      tipo?: string; fecha_despacho?: string | null; creado_por?: string;
    };
    const fecha     = (body.fecha ?? '').trim();
    const storeCod  = (body.store_cod ?? '').trim().toUpperCase();
    const zona      = (body.zona ?? '').trim();
    if (!fecha || !storeCod || !zona) {
      return NextResponse.json({ error: 'fecha, store_cod y zona requeridos' }, { status: 400 });
    }
    if (!ZONAS.has(zona)) {
      return NextResponse.json({ error: `zona inválida: ${zona}` }, { status: 400 });
    }

    const row = {
      fecha,
      store_cod:      storeCod,
      zona,
      tipo:           (body.tipo ?? 'adelanto').trim() || 'adelanto',
      fecha_despacho: body.fecha_despacho || null,
      creado_por:     body.creado_por ?? null,
    };

    // upsert por (fecha, store_cod): re-agregar la misma tienda actualiza, no duplica.
    const { data, error } = await supabaseServer()
      .from('tiendas_adelanto')
      .upsert(row, { onConflict: 'fecha,store_cod' })
      .select(FIELDS)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const { error } = await supabaseServer()
    .from('tiendas_adelanto')
    .delete()
    .eq('id', Number(id));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
