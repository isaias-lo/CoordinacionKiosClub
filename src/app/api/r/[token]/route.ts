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

  // Enriquecer cada tienda del manifiesto con su modo de recepción del pallet (consolidado/
  // desconsolidado), que vive en el catálogo `tiendas`. Así el dato "viaja" al manifiesto.
  const tiendasRuta = (ruta.ruta_tiendas ?? []) as { store_cod?: string; recepcion_pallet?: string | null }[];
  const cods = [...new Set(tiendasRuta.map(t => String(t.store_cod ?? '').trim().toUpperCase()).filter(Boolean))];
  if (cods.length) {
    const { data: cat } = await supabaseServer().from('tiendas').select('codigo, recepcion_pallet').in('codigo', cods);
    const recepByCod = Object.fromEntries((cat ?? []).map(c => [String(c.codigo).trim().toUpperCase(), c.recepcion_pallet as string | null]));
    for (const t of tiendasRuta) {
      t.recepcion_pallet = recepByCod[String(t.store_cod ?? '').trim().toUpperCase()] ?? null;
    }
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
