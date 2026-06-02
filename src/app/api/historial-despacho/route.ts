import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

interface HistorialDespachoBody {
  fecha: string;
  supervisor: string;
  totalTiendas: number;
  totalPallets: number;
  totalBultos: number;
  totalRutas: number;
  kmTotal: number;
  resumen: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Partial<HistorialDespachoBody>;
    const {
      fecha,
      supervisor,
      totalTiendas,
      totalPallets,
      totalBultos,
      totalRutas,
      kmTotal,
      resumen,
    } = body;

    if (!fecha) {
      return NextResponse.json({ error: 'fecha es requerida' }, { status: 400 });
    }

    const sb = supabaseServer();
    const { data, error } = await sb
      .from('historial_despacho')
      .insert({
        fecha,
        supervisor:     supervisor     ?? '',
        total_tiendas:  totalTiendas   ?? 0,
        total_pallets:  totalPallets   ?? 0,
        total_bultos:   totalBultos    ?? 0,
        total_rutas:    totalRutas     ?? 0,
        km_total:       kmTotal        ?? 0,
        resumen:        resumen        ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('[historial-despacho] insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error('[historial-despacho] unexpected error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
