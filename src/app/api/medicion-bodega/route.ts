import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, hayServiceRole } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';
import { fechaChile } from '@/lib/fechaChile';
import { medirDias, type RegistroBodega } from '@/features/despacho/shared/reingresosBodega';
import { medirBorrados, type BorradoBodega } from '@/features/despacho/shared/borradosRepetidos';

/**
 * GET /api/medicion-bodega?dias=10 — cuánto trabajo de Bodega se hizo dos veces, por día.
 *
 * Existe porque la pregunta "¿se sigue perdiendo trabajo en Bodega?" decide si hacen falta más
 * arreglos de concurrencia, y contestarla a mano exige acceso directo a la base — que es justo lo
 * que falla el día que se necesita.
 *
 * **Lee `actividad_bodega`, no `picking_eventos`.** La primera versión de esta ruta miraba
 * `picking_eventos` buscando un borrado seguido de un alta, y ese caso casi no ocurre: de 45 a 89
 * borrados por día, entre cero y ocho tuvieron un alta después. Lo que de verdad pasa —dos
 * personas pesando la misma unidad— no borra ni crea nada y no deja rastro ahí. El porqué, con el
 * caso real que lo destapó, está en `shared/reingresosBodega.ts`.
 *
 * Devuelve DOS medidas distintas, que responden a dos preguntas distintas:
 *
 *   · `dias`     — trabajo REPESADO: dos personas pesando la misma unidad (`registrar_item`).
 *   · `borrados` — trabajo REBORRADO: unidades que hubo que borrar dos veces porque volvieron
 *                  (`eliminar_item` repetido sobre el mismo slot). Es la huella del bug que
 *                  arreglaron las lápidas (#573 / #580) y la forma de comprobar si sirvió:
 *                  nadie borra dos veces algo que se borró bien. Baseline del 24/09, 12 días:
 *                  de 135 chocolates borrados, 35 volvieron — el 26%.
 *
 * Corre en el SERVIDOR con clave de servicio, y lo dice en la respuesta: sin ella una tabla con
 * RLS devuelve cero filas SIN error y el resultado sale vacío pareciendo correcto.
 */
export const dynamic = 'force-dynamic';

const PAGINA = 1000;

/** Lo que devuelve la consulta, antes de aplanar `detalle`. */
interface FilaActividad {
  fecha: string;
  accion: string;
  tienda_cod: string | null;
  actor_name: string | null;
  created_at: string;
  detalle: { slotId?: number | string | null; peso?: number | string | null; label?: string | null } | null;
}

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const dias = Math.min(60, Math.max(1, Number(request.nextUrl.searchParams.get('dias')) || 10));
    const hoy = fechaChile();
    const desde = fechaChile(-(dias - 1));   // incluye hoy: la jornada en curso también se mide

    const sb = supabaseServer();
    // PostgREST devuelve como mucho ~1000 filas y NO avisa cuando corta. Una jornada pasa los 200
    // registros, así que diez días sin paginar traerían un pedazo — y lo que falta BAJA el número,
    // que es la dirección en la que un error acá pasa inadvertido ("bajaron los reingresos").
    const filas: FilaActividad[] = [];
    for (let desdeFila = 0; ; desdeFila += PAGINA) {
      const { data, error } = await sb
        .from('actividad_bodega')
        .select('fecha, accion, tienda_cod, actor_name, created_at, detalle')
        // Las dos acciones en UNA pasada: son la misma tabla y el mismo rango, y separarlas en dos
        // consultas duplicaría la paginación (que es justo donde se pierden filas en silencio).
        .in('accion', ['registrar_item', 'eliminar_item'])
        .gte('fecha', desde)
        .lte('fecha', hoy)
        .order('id', { ascending: true })          // orden estable: sin él una página repite o salta
        .range(desdeFila, desdeFila + PAGINA - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const pagina = (data ?? []) as FilaActividad[];
      filas.push(...pagina);
      if (pagina.length < PAGINA) break;           // última página
    }

    const registros: RegistroBodega[] = filas
      .filter(f => f.accion === 'registrar_item')
      .map(f => ({
        fecha: f.fecha,
        tienda: f.tienda_cod,
        actor: f.actor_name,
        createdAt: f.created_at,
        slotId: num(f.detalle?.slotId),
        peso:   num(f.detalle?.peso),
      }));

    const borrados: BorradoBodega[] = filas
      .filter(f => f.accion === 'eliminar_item')
      .map(f => ({ fecha: f.fecha, slotId: num(f.detalle?.slotId), label: f.detalle?.label ?? null }));

    return NextResponse.json({
      desde, hasta: hoy,
      dias: medirDias(registros),
      borrados: medirBorrados(borrados),
      // Los contadores viajan a propósito: si el número sorprende, lo primero que hay que poder
      // descartar es que la consulta leyó de menos. `sinSlot` avisa del otro modo de falla — filas
      // que no se pueden emparejar porque les falta el slot, y que bajarían el total en silencio.
      registrosLeidos: registros.length,
      borradosLeidos: borrados.length,
      sinSlot: registros.filter(r => r.slotId == null).length,
      // Un borrado sin slot no se puede emparejar y se descarta: bajaría el porcentaje, que es la
      // dirección en la que un error acá pasa inadvertido.
      borradosSinSlot: borrados.filter(bo => bo.slotId == null).length,
      serviceRole: hayServiceRole(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
