import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

const VALID_ESTADOS = new Set(['Registrado', 'Pendiente', 'En camino', 'Recibido', 'Diferencia']);

export async function PATCH(request: NextRequest) {
  try {
    const { cod, estado } = await request.json() as { cod: string; estado: string };

    if (!cod || !VALID_ESTADOS.has(estado)) {
      return NextResponse.json({ error: 'cod y estado requeridos' }, { status: 400 });
    }

    const sb = supabaseServer();

    await Promise.all([
      sb.from('despacho_rm').update({ seguimiento: estado }).eq('cod', cod),
      sb.from('despacho_regiones').update({ seguimiento: estado }).eq('cod', cod),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
