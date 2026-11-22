import { NextRequest, NextResponse } from 'next/server';
import { verifyPersona } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { anotarEventos } from '@/lib/mantencionServer';
import { veTodo } from '@/features/mantencion/utils/permisoMantencion';
import { AccionSchema, efectoDeAccion, motivoParaNo } from '@/features/mantencion/utils/acciones';
import { solicitudDeFila, type FilaSolicitud } from '@/features/mantencion/utils/filas';

/**
 * PATCH /api/mantencion/solicitudes/:id — lo que decide Mantención sobre una solicitud:
 * clasificar, descartar, unir con la original o marcar «no es duplicado».
 *
 * Solo quien `veTodo`. La tienda nunca clasifica ni cierra: es regla del negocio, no de pantalla,
 * y por eso se corta acá aunque la pantalla de la tienda no tenga esos botones.
 */
export const dynamic = 'force-dynamic';

const COLUMNAS = 'id, codigo_tienda, categoria, descripcion, urgencia, estado, origen, duplicada_de, '
  + 'espera_material, creada_por_nombre, created_at';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const persona = await verifyPersona(request);
  if (!persona) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!veTodo(persona.role)) return NextResponse.json({ error: 'Solo Mantención decide sobre las solicitudes' }, { status: 403 });

  const { id } = await params;
  // Un id que no es uuid haría fallar la consulta con un 500; es simplemente una que no existe.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'La solicitud no existe' }, { status: 404 });
  }
  const r = AccionSchema.safeParse(await request.json().catch(() => null));
  if (!r.success) return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  const accion = r.data;

  try {
    const sb = supabaseServer();
    const ids = 'originalId' in accion ? [id, accion.originalId] : [id];
    const { data, error } = await sb.from('mant_solicitudes').select(COLUMNAS).in('id', ids);
    if (error) throw new Error(`mant_solicitudes: ${error.message}`);
    const filas = (data ?? []) as unknown as FilaSolicitud[];
    const filaSol = filas.find(f => f.id === id);
    if (!filaSol) return NextResponse.json({ error: 'La solicitud no existe' }, { status: 404 });
    const solicitud = solicitudDeFila(filaSol);
    const filaOrig = 'originalId' in accion ? filas.find(f => f.id === accion.originalId) : undefined;
    const original = filaOrig ? solicitudDeFila(filaOrig) : null;

    const motivo = motivoParaNo(accion, solicitud, original);
    if (motivo) return NextResponse.json({ error: motivo }, { status: 409 });

    const { cambios, eventos } = efectoDeAccion(accion, solicitud);
    if (Object.keys(cambios).length) {
      const { error: updErr } = await sb.from('mant_solicitudes').update(cambios).eq('id', id);
      if (updErr) throw new Error(`update mant_solicitudes: ${updErr.message}`);
    }
    await anotarEventos(sb, persona, id, eventos);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[mantencion/solicitudes PATCH]', err);
    return NextResponse.json({ error: 'No se pudo guardar el cambio' }, { status: 500 });
  }
}
