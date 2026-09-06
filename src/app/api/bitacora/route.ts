import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';

// GET /api/bitacora — los cambios del catálogo, más reciente primero.
//
// Solo lectura y solo por acá: la tabla tiene RLS para service_role, así que el cliente no puede
// escribirla. Un registro que el cliente puede tocar no sirve para responder qué pasó.
//
// Filtros opcionales: entidad ('tienda'|'flota'), entidad_id (código/patente), actor_id, q (texto).
export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const entidad   = sp.get('entidad');
  const entidadId = sp.get('entidad_id');
  const actorId   = sp.get('actor_id');
  const limit = Math.min(500, Math.max(1, Number(sp.get('limit') ?? 100)));

  let q = supabaseServer()
    .from('bitacora_cambios')
    // `antes`/`despues` NO se traen en el listado: son la ficha completa y pesan. El resumen es
    // lo que se lee; el detalle se pide por fila cuando hace falta.
    .select('id, created_at, actor_id, actor_name, entidad, entidad_id, accion, resumen')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (entidad)   q = q.eq('entidad', entidad);
  if (entidadId) q = q.eq('entidad_id', entidadId);
  if (actorId)   q = q.eq('actor_id', actorId);

  const { data, error } = await q;
  if (error) {
    console.error('[GET /api/bitacora]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}
