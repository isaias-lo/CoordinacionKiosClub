import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const { data: ruta, error } = await supabaseServer()
    .from('rutas_despacho')
    .select('*, ruta_tiendas(*), ruta_guias(*)')
    .eq('token_qr', token)
    .single();

  if (error || !ruta) {
    return NextResponse.json({ error: 'Ruta no encontrada o token inválido' }, { status: 404 });
  }

  // Token expirado
  if (ruta.token_exp && new Date(ruta.token_exp as string) < new Date()) {
    return NextResponse.json({ error: 'El enlace ha expirado' }, { status: 410 });
  }

  // Registrar evento de escaneo QR
  await supabaseServer()
    .from('ruta_eventos')
    .insert({
      ruta_id: ruta.id,
      tipo:    'qr_scan',
      datos:   { token, timestamp: new Date().toISOString() },
    });

  return NextResponse.json({ data: ruta });
}
