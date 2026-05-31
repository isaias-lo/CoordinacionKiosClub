import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fuente = searchParams.get('fuente') ?? 'conductor';
    const desde  = searchParams.get('desde');   // YYYY-MM-DD
    const hasta  = searchParams.get('hasta');   // YYYY-MM-DD
    const cod    = searchParams.get('cod');
    const limit  = Math.min(parseInt(searchParams.get('limit') ?? '300'), 500);

    const sb = supabaseServer();
    let q = sb.from('recepcion').select('*').eq('fuente', fuente)
              .order('created_at', { ascending: false }).limit(limit);

    if (desde) q = q.gte('created_at', `${desde}T00:00:00`);
    if (hasta) q = q.lte('created_at', `${hasta}T23:59:59`);
    if (cod)   q = q.eq('cod', cod);

    const { data, error } = await q;
    if (error) throw error;

    const records = data ?? [];

    const stats = {
      total:           records.length,
      sin_novedad:     records.filter(r =>
        r.pallets_sent === r.pallets_recibidos &&
        r.bultos_sent  === r.bultos_recibidos  &&
        (r.contenedores_sent ?? 0) === (r.contenedores_recibidos ?? 0)
      ).length,
      con_diferencia:  records.filter(r =>
        r.pallets_sent !== r.pallets_recibidos ||
        r.bultos_sent  !== r.bultos_recibidos  ||
        (r.contenedores_sent ?? 0) !== (r.contenedores_recibidos ?? 0)
      ).length,
      sello_intacto:   records.filter(r => r.sello_estado === 'intacto').length,
      sello_roto:      records.filter(r => r.sello_estado === 'roto').length,
      sello_ausente:   records.filter(r => r.sello_estado === 'ausente').length,
      con_fotos:       records.filter(r => (r.estado_fotos?.length ?? 0) > 0).length,
    };

    return NextResponse.json({ records, stats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[panel-operaciones]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
