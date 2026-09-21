import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, hayServiceRole } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';
import { fechaChile } from '@/lib/fechaChile';
import { medirDias, type EventoBodega } from '@/features/despacho/shared/reingresosBodega';

/**
 * GET /api/medicion-bodega?dias=10 — cuánto trabajo de Bodega se hizo dos veces, por día.
 *
 * Existe porque la pregunta "¿se sigue perdiendo trabajo en Bodega?" es la que decide si hacen
 * falta más arreglos de concurrencia, y hasta ahora solo se podía contestar escribiendo SQL a mano
 * contra la base. Eso la dejaba fuera del alcance del coordinador —que es quien la necesita— y la
 * volvía imposible el día que el acceso directo falla.
 *
 * Corre en el SERVIDOR por la misma razón que `/api/backlog-v2`: con clave de servicio. La
 * respuesta dice si la tiene (`serviceRole`), porque sin ella una tabla con RLS devuelve cero filas
 * SIN error y el resultado sale vacío pareciendo correcto.
 *
 * La definición de "reingreso" y sus límites viven en `shared/reingresosBodega.ts`, con tests. Acá
 * solo se leen las filas.
 */
export const dynamic = 'force-dynamic';

const PAGINA = 1000;

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const dias = Math.min(60, Math.max(1, Number(request.nextUrl.searchParams.get('dias')) || 10));
    const hoy = fechaChile();
    const desde = fechaChile(-(dias - 1));   // incluye hoy: la jornada en curso también se mide

    const sb = supabaseServer();
    // PostgREST devuelve como mucho ~1000 filas y NO avisa cuando corta. Un solo día de Bodega
    // pasa las 300 filas de eventos, así que diez días sin paginar se traerían un pedazo — y el
    // pedazo que falta baja el número, que es justo la dirección en la que un error acá pasaría
    // inadvertido ("bajaron los reingresos"). Ya pasó una vez, en el backlog de 2ª vuelta.
    const eventos: EventoBodega[] = [];
    for (let desdeFila = 0; ; desdeFila += PAGINA) {
      const { data, error } = await sb
        .from('picking_eventos')
        .select('date, event_type, store_cod, tipo, pallet_id, created_at')
        .gte('date', desde)
        .lte('date', hoy)
        .order('id', { ascending: true })          // orden estable: sin él una página repite o salta
        .range(desdeFila, desdeFila + PAGINA - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const pagina = (data ?? []) as EventoBodega[];
      eventos.push(...pagina);
      if (pagina.length < PAGINA) break;           // última página
    }

    return NextResponse.json({
      desde, hasta: hoy,
      dias: medirDias(eventos),
      // Los contadores viajan a propósito: si el número sorprende, lo primero que hay que poder
      // descartar es que la consulta leyó de menos.
      eventosLeidos: eventos.length,
      serviceRole: hayServiceRole(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
