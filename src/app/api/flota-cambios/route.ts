import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(request: NextRequest) {
  const fecha  = request.nextUrl.searchParams.get('fecha');
  const rutaId = request.nextUrl.searchParams.get('ruta_id');

  let query = supabaseServer()
    .from('flota_cambios')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(200);

  if (fecha)  query = query.eq('fecha', fecha);
  if (rutaId) query = query.eq('ruta_id', parseInt(rutaId));

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
