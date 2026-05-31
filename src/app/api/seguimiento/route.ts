import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

const VALID_ESTADOS = new Set(['Registrado', 'Pendiente', 'En camino', 'Entregado', 'Recibido', 'Diferencia']);

function todayFecha(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export async function PATCH(request: NextRequest) {
  try {
    const { cod, estado, fecha } = await request.json() as { cod: string; estado: string; fecha?: string };

    if (!cod || !VALID_ESTADOS.has(estado)) {
      return NextResponse.json({ error: 'cod y estado requeridos' }, { status: 400 });
    }

    const sb = supabaseServer();
    const fechaFiltro = fecha && fecha.trim().length > 0 ? fecha : todayFecha();

    await Promise.all([
      sb.from('despacho_rm').update({ seguimiento: estado }).eq('cod', cod).eq('fecha', fechaFiltro),
      sb.from('despacho_regiones').update({ seguimiento: estado }).eq('cod', cod).eq('fecha', fechaFiltro),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
