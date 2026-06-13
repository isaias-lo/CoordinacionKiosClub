import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const ruta_id = request.nextUrl.searchParams.get('ruta_id');
  if (!ruta_id) return NextResponse.json({ error: 'ruta_id requerido' }, { status: 400 });

  const { data, error } = await supabaseServer()
    .from('ruta_eventos')
    .select('*')
    .eq('ruta_id', ruta_id)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const body = await request.json() as {
    ruta_id: number;
    tipo: 'salida' | 'qr_scan' | 'entrega' | 'recepcion' | 'incidencia';
    datos?: Record<string, unknown>;
    usuario_id?: string;
  };

  const VALID = ['salida', 'qr_scan', 'entrega', 'recepcion', 'incidencia'];
  if (!VALID.includes(body.tipo))
    return NextResponse.json({ error: 'Tipo de evento inválido' }, { status: 400 });

  const { data, error } = await supabaseServer()
    .from('ruta_eventos')
    .insert({
      ruta_id:    body.ruta_id,
      tipo:       body.tipo,
      datos:      body.datos ?? {},
      usuario_id: body.usuario_id ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Si es salida, actualizar estado de la ruta a en_camino
  if (body.tipo === 'salida') {
    await supabaseServer()
      .from('rutas_despacho')
      .update({ estado: 'en_camino' })
      .eq('id', body.ruta_id);
  }
  // Si es recepcion, marcar entregado
  if (body.tipo === 'recepcion') {
    await supabaseServer()
      .from('rutas_despacho')
      .update({ estado: 'recibido' })
      .eq('id', body.ruta_id);
  }

  return NextResponse.json({ data });
}
