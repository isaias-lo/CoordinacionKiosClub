import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET() {
  try {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from('tiendas')
      .select('*')
      .order('codigo');
    if (error) throw error;
    return NextResponse.json({ tiendas: data });
  } catch (err) {
    console.error('[GET /api/tiendas]', err);
    return NextResponse.json({ error: 'Error al obtener tiendas' }, { status: 500 });
  }
}

interface TiendaBody {
  codigo: string;
  nombre: string;
  direccion?: string;
  region?: string;
  sector_comuna?: string;
  corredor?: string;
  tipo?: string;
  ventana?: string;
  frecuencia?: string;
  prom_por_dia?: string;
  lat?: number | null;
  lon?: number | null;
  correos?: string;
  tel_encargado?: string;
  supervisor?: string;
  tel_supervisor?: string;
  transportista?: string;
  activo?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as TiendaBody;
    if (!body.codigo || !body.nombre) {
      return NextResponse.json({ error: 'codigo y nombre son requeridos' }, { status: 400 });
    }

    const sb = supabaseServer();
    const { data, error } = await sb
      .from('tiendas')
      .upsert({
        codigo:         body.codigo.trim().toUpperCase(),
        nombre:         body.nombre.trim(),
        direccion:      body.direccion ?? '',
        region:         body.region ?? '',
        sector_comuna:  body.sector_comuna ?? '',
        corredor:       body.corredor ?? '',
        tipo:           body.tipo ?? '',
        ventana:        body.ventana ?? '',
        frecuencia:     body.frecuencia ?? '',
        prom_por_dia:   body.prom_por_dia ?? '',
        lat:            body.lat ?? null,
        lon:            body.lon ?? null,
        correos:        body.correos ?? '',
        tel_encargado:  body.tel_encargado ?? '',
        supervisor:     body.supervisor ?? '',
        tel_supervisor: body.tel_supervisor ?? '',
        transportista:  body.transportista ?? '',
        activo:         body.activo ?? true,
      }, { onConflict: 'codigo' })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ tienda: data });
  } catch (err) {
    console.error('[POST /api/tiendas]', err);
    return NextResponse.json({ error: 'Error al guardar tienda' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const codigo = searchParams.get('codigo');
    if (!codigo) return NextResponse.json({ error: 'codigo requerido' }, { status: 400 });

    const sb = supabaseServer();
    const { error } = await sb.from('tiendas').delete().eq('codigo', codigo);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/tiendas]', err);
    return NextResponse.json({ error: 'Error al eliminar tienda' }, { status: 500 });
  }
}
