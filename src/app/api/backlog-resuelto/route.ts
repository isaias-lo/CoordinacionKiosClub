import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth, verifyActor } from '@/lib/apiAuth';
import { claveDeResuelta } from '@/features/despacho/rutas/utils/backlogSegundaVuelta';

/**
 * Las tiendas de 2ª vuelta que alguien dio por resueltas FUERA del sistema.
 *
 * El backlog es una resta que se recalcula sola (ver `/api/backlog-v2`). Eso lo hace confiable
 * —no depende de que nadie apriete nada— y a la vez ciego: una tienda despachada a mano, o
 * consolidada con otro envío, no tiene cómo salir de la lista y queda ahí para siempre.
 *
 * Esta tabla es el único lugar donde una PERSONA puede decirle al cálculo «esto ya está». No
 * reemplaza la resta: se le aplica encima, y queda anotado quién lo decidió y cuándo.
 *
 * ── POR QUÉ NO SE BORRA LA FILA DE `despacho_sesion` ──────────────────────────────────────────
 *
 * Es lo que haría un botón «eliminar», y es destructivo: esa fila es el registro de que Bodega
 * armó esa carga, y alimenta el Enrutador y las mediciones. Borrarla para callar un aviso destruye
 * el hecho junto con el aviso. Acá se anota la decisión al lado y el hecho queda intacto.
 *
 * ── POR QUÉ ESCRIBE EL SERVIDOR Y NO EL NAVEGADOR ─────────────────────────────────────────────
 *
 * Marcar carga como resuelta es la clase de acción que hay que poder auditar después. Pasando por
 * acá, el actor sale del token verificado —no de lo que el cliente diga que es—, igual que en
 * `actividad_bodega`. La tabla tiene RLS con política solo de lectura: la escritura entra por este
 * camino o no entra.
 */
export const dynamic = 'force-dynamic';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** GET — las marcas de los últimos días, para pintar quién resolvió qué. */
export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const desde = request.nextUrl.searchParams.get('desde') ?? '';
  const sb = supabaseServer();
  let q = sb.from('backlog_resuelto').select('fecha_origen, tienda_cod, resuelto_por, resuelto_at, nota');
  if (ISO.test(desde)) q = q.gte('fecha_origen', desde);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ resueltas: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Lo que las dos escrituras necesitan leer del cuerpo, ya validado. */
async function leerCuerpo(request: NextRequest): Promise<{ fecha: string; cods: string[]; nota: string } | null> {
  const body = await request.json().catch(() => null) as { fecha?: string; cods?: unknown; nota?: string } | null;
  const fecha = String(body?.fecha ?? '').trim();
  if (!ISO.test(fecha)) return null;
  // Se normaliza acá y con la MISMA función que usa el filtro. Si cada punta recortara a su
  // manera, una marca escrita con el código en minúsculas no cruzaría nunca con el pendiente.
  const cods = [...new Set(
    (Array.isArray(body?.cods) ? body.cods : [])
      .map(c => claveDeResuelta(fecha, String(c ?? '')).split('::')[1])
      .filter(Boolean),
  )];
  if (!cods.length) return null;
  return { fecha, cods, nota: String(body?.nota ?? '').trim().slice(0, 300) };
}

/** POST — marcar una tienda, varias, o todas las de un día (el cliente manda la lista). */
export async function POST(request: NextRequest) {
  const actor = await verifyActor(request);
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const cuerpo = await leerCuerpo(request);
  if (!cuerpo) return NextResponse.json({ error: 'Falta `fecha` (AAAA-MM-DD) o `cods`' }, { status: 400 });

  const filas = cuerpo.cods.map(cod => ({
    fecha_origen: cuerpo.fecha, tienda_cod: cod,
    resuelto_por: actor.name, resuelto_por_id: actor.id,
    nota: cuerpo.nota || null, resuelto_at: new Date().toISOString(),
  }));

  // `upsert` y no `insert`: volver a marcar algo ya marcado es inofensivo y pasa seguido —dos
  // personas mirando la misma pantalla—. Con `insert` el segundo clic daría un error de clave
  // duplicada y parecería que la acción falló.
  const sb = supabaseServer();
  const { error } = await sb.from('backlog_resuelto').upsert(filas, { onConflict: 'fecha_origen,tienda_cod' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, marcadas: filas.length, por: actor.name });
}

/** DELETE — deshacer. Marcar de más tiene que costar un clic desarmarlo, no una consulta a la base. */
export async function DELETE(request: NextRequest) {
  if (!await verifyAuth(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const cuerpo = await leerCuerpo(request);
  if (!cuerpo) return NextResponse.json({ error: 'Falta `fecha` (AAAA-MM-DD) o `cods`' }, { status: 400 });

  const sb = supabaseServer();
  const { error } = await sb.from('backlog_resuelto').delete()
    .eq('fecha_origen', cuerpo.fecha).in('tienda_cod', cuerpo.cods);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, desmarcadas: cuerpo.cods.length });
}
