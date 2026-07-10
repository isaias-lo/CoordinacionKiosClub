import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';

// Guarda el feedback del asistente IA: qué propuso la IA, qué se usó finalmente y cuál se eligió.
// Alimenta el aprendizaje (historyFetcher prioriza los días con feedback). Fire-and-forget desde el
// cliente: si falla, no debe romper el flujo de "usar ruta".
interface Body {
  fecha?: string;
  fuente?: string;                                  // 'despacho' | 'segunda_vuelta'
  propuesta_ia?: Record<string, string[]> | null;   // { patente: [cods] } de la IA (null si no hubo)
  final?: Record<string, string[]>;                 // { patente: [cods] } finalmente usada
  elegida?: string;                                 // 'ia' | 'mia' | 'gps'
  edit_count?: number;
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
      fecha:        body.fecha,
      fuente:       body.fuente ?? 'despacho',
      propuesta_ia: body.propuesta_ia ?? null,
      final:        body.final,
      elegida:      body.elegida,
      edit_count:   body.edit_count ?? 0,
      supervisor:   body.supervisor ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
