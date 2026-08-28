import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';

// Guarda y lee el feedback del motor de asignación: qué PROPUSO el motor (v2 o IA), qué se usó
// finalmente y cuál se eligió. Cierra el lazo de aprendizaje: el coordinador corrige a mano y acá
// se mide cuánto. Fire-and-forget desde el cliente: si el POST falla, no rompe el "usar ruta".
interface Body {
  fecha?: string;
  fuente?: string;                                  // 'despacho' | 'segunda_vuelta'
  propuesta_ia?: Record<string, string[]> | null;   // { patente: [cods] } que propuso el motor
  motor?: string;                                   // 'v2' | 'ia' — quién PRODUJO la propuesta
  final?: Record<string, string[]>;                 // { patente: [cods] } finalmente usada
  elegida?: string;                                 // 'ia' | 'mia' | 'gps'
  edit_count?: number;
  segunda_vuelta?: string[];                        // cods que el motor mandó a 2ª vuelta (a propósito)
  sin_flota?: string[];                             // cods sin vehículo activo que los lleve
  supervisor?: string;
}

export async function POST(request: NextRequest) {
  if (!await verifyAuth(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const body = await request.json() as Body;
    if (!body.fecha || !body.final || !body.elegida) {
      return NextResponse.json({ error: 'Faltan campos (fecha, final, elegida)' }, { status: 400 });
    }
    const sb = supabaseServer();
    const { error } = await sb.from('ia_asignacion_feedback').insert({
      fecha:          body.fecha,
      fuente:         body.fuente ?? 'despacho',
      propuesta_ia:   body.propuesta_ia ?? null,
      motor:          body.motor ?? null,
      final:          body.final,
      elegida:        body.elegida,
      edit_count:     body.edit_count ?? 0,
      segunda_vuelta: body.segunda_vuelta ?? [],
      sin_flota:      body.sin_flota ?? [],
      supervisor:     body.supervisor ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Devuelve las filas de feedback de los últimos `dias` (default 30) para medir la coincidencia
// motor↔coordinador en el Tablero vivo. `fecha` de esta tabla es ISO ('YYYY-MM-DD'), así que el
// filtro por string es correcto (NO se cruza contra despacho_rm/regiones, que vienen en DD/MM/YYYY).
export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const dias = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get('dias') ?? '30')));
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  const desdeISO = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}-${String(desde.getDate()).padStart(2, '0')}`;

  const sb = supabaseServer();
  const { data, error } = await sb
    .from('ia_asignacion_feedback')
    .select('fecha, fuente, propuesta_ia, motor, final, elegida, edit_count, segunda_vuelta, sin_flota')
    .gte('fecha', desdeISO)
    .order('fecha', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
