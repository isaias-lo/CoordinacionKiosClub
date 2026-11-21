import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyPersona } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { fechaChile } from '@/lib/fechaChile';
import {
  BUCKET_MANT, SEGUNDOS_URL_FIRMADA, anotarEventos, tiendasDe, todasLasFilas, enTandas, type Persona,
} from '@/lib/mantencionServer';
import { veTodo } from '@/features/mantencion/utils/permisoMantencion';
import { validarSolicitud } from '@/features/mantencion/utils/validarSolicitud';
import { leerFotos, rutaFoto } from '@/features/mantencion/utils/fotos';
import { comentarioDeFila, solicitudDeFila, type FilaComentario, type FilaSolicitud } from '@/features/mantencion/utils/filas';
import { comentariosParaTienda } from '@/features/mantencion/utils/conversacion';
import type { ComentarioMant, FotoMant } from '@/features/mantencion/tipos';
import type { ParDescartado } from '@/features/mantencion/utils/tablero';

/**
 * /api/mantencion/solicitudes
 *
 *   GET  ?tienda=COD   las solicitudes que esta persona puede ver, con fotos y conversación.
 *   POST               crea una solicitud con sus fotos (data URL). Idempotente por `clientOpId`.
 *
 * Lectura y escritura por acá, con service role: ver la cabecera de `lib/mantencionServer.ts`.
 */
export const dynamic = 'force-dynamic';

/** Las últimas N: la pantalla de la tienda muestra lo reciente, no el archivo entero. */
const MAX_SOLICITUDES = 300;

const COLUMNAS = 'id, codigo_tienda, categoria, descripcion, urgencia, estado, origen, duplicada_de, '
  + 'espera_material, creada_por_nombre, created_at';

export async function GET(request: NextRequest) {
  const persona = await verifyPersona(request);
  if (!persona) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const sb = supabaseServer();
    const tiendas = await tiendasDe(sb, persona);
    const todo = veTodo(persona.role);
    const pedida = request.nextUrl.searchParams.get('tienda')?.trim().toUpperCase() || null;
    const nombres = new Map(tiendas.map(t => [t.codigo.toUpperCase(), t.nombre]));

    if (pedida && !todo && !nombres.has(pedida)) {
      return NextResponse.json({ error: 'Esa tienda no está entre las tuyas' }, { status: 403 });
    }
    if (!todo && tiendas.length === 0) return NextResponse.json({ solicitudes: [], paresDescartados: [] });

    let q = sb.from('mant_solicitudes').select(COLUMNAS)
      .order('created_at', { ascending: false }).limit(MAX_SOLICITUDES);
    if (pedida) {
      const real = tiendas.find(t => t.codigo.toUpperCase() === pedida)?.codigo ?? pedida;
      q = q.eq('codigo_tienda', real);
    } else if (!todo) {
      q = q.in('codigo_tienda', tiendas.map(t => t.codigo));
    }
    const { data: filas, error } = await q;
    if (error) throw new Error(`mant_solicitudes: ${error.message}`);
    // `COLUMNAS` es un string armado, así que el cliente no puede deducir el tipo de la fila.
    const lista = (filas ?? []) as unknown as FilaSolicitud[];
    const ids = lista.map(s => s.id);

    const [fotos, comentarios, paresDescartados] = await Promise.all([
      fotosDe(sb, ids), comentariosDe(sb, ids), todo ? paresNoDuplicados(sb, ids) : Promise.resolve([]),
    ]);

    const solicitudes = lista.map(f => {
      const propios = comentarios.get(f.id) ?? [];
      return solicitudDeFila(f, {
        nombreTienda: nombres.get(f.codigo_tienda.toUpperCase()),
        fotos: fotos.get(f.id) ?? [],
        // La tienda no ve las notas para el técnico: ver `conversacion.ts`.
        comentarios: todo ? propios : comentariosParaTienda(propios),
      });
    });
    return NextResponse.json({ solicitudes, paresDescartados });
  } catch (err) {
    console.error('[mantencion/solicitudes GET]', err);
    return NextResponse.json({ error: 'No se pudieron cargar las solicitudes' }, { status: 500 });
  }
}

/** Las fotos de cada solicitud, con su URL firmada. */
async function fotosDe(sb: SupabaseClient, ids: string[]): Promise<Map<string, FotoMant[]>> {
  const out = new Map<string, FotoMant[]>();
  for (const tanda of enTandas(ids)) {
    const filas = await todasLasFilas<{ id: number; solicitud_id: string; tipo: string; ruta: string }>(
      (desde, hasta) => sb.from('mant_fotos').select('id, solicitud_id, tipo, ruta')
        .in('solicitud_id', tanda).order('id').range(desde, hasta),
    );
    if (filas.length === 0) continue;
    const { data: firmadas, error } = await sb.storage.from(BUCKET_MANT)
      .createSignedUrls(filas.map(f => f.ruta), SEGUNDOS_URL_FIRMADA);
    if (error) console.error('[mantencion] firmar fotos:', error.message);
    const url = new Map((firmadas ?? []).map(x => [x.path, x.error ? null : x.signedUrl]));
    for (const f of filas) {
      const lista = out.get(f.solicitud_id) ?? [];
      lista.push({ id: f.id, tipo: f.tipo === 'despues' ? 'despues' : 'antes', url: url.get(f.ruta) ?? null });
      out.set(f.solicitud_id, lista);
    }
  }
  return out;
}

/**
 * Los pares que Mantención ya marcó «no es duplicado». La decisión vive en la bitácora: el evento
 * cuelga de la solicitud posible y su `valor_nuevo` es la original (ver `acciones.ts`).
 */
async function paresNoDuplicados(sb: SupabaseClient, ids: string[]): Promise<ParDescartado[]> {
  const out: ParDescartado[] = [];
  for (const tanda of enTandas(ids)) {
    const filas = await todasLasFilas<{ solicitud_id: string; valor_nuevo: string | null }>(
      (desde, hasta) => sb.from('mant_eventos').select('solicitud_id, valor_nuevo')
        .eq('campo', 'no_es_duplicado').in('solicitud_id', tanda).order('id').range(desde, hasta),
    );
    for (const f of filas) if (f.valor_nuevo) out.push({ originalId: f.valor_nuevo, posibleId: f.solicitud_id });
  }
  return out;
}

async function comentariosDe(sb: SupabaseClient, ids: string[]): Promise<Map<string, ComentarioMant[]>> {
  const out = new Map<string, ComentarioMant[]>();
  for (const tanda of enTandas(ids)) {
    const filas = await todasLasFilas<FilaComentario>(
      (desde, hasta) => sb.from('mant_comentarios')
        .select('id, solicitud_id, tipo, texto, autor_nombre, created_at')
        .in('solicitud_id', tanda).order('created_at').range(desde, hasta),
    );
    for (const f of filas) {
      const c = comentarioDeFila(f);
      if (!c) continue;
      const lista = out.get(c.solicitudId) ?? [];
      lista.push(c);
      out.set(c.solicitudId, lista);
    }
  }
  return out;
}

/* ── POST: crear ───────────────────────────────────────────────────────────────────────────── */

export async function POST(request: NextRequest) {
  const persona = await verifyPersona(request);
  if (!persona) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let cuerpo: Record<string, unknown>;
  try {
    const crudo = await request.json();
    if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) throw new Error('no es un objeto');
    cuerpo = crudo as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'La solicitud llegó dañada' }, { status: 400 });
  }

  try {
    const sb = supabaseServer();
    const tiendas = await tiendasDe(sb, persona);
    const todo = veTodo(persona.role);

    // Solo Mantención carga solicitudes «por WhatsApp» a nombre de una tienda. Para el supervisor
    // el origen es siempre la app, mande lo que mande.
    const entrada = { ...cuerpo, origen: todo ? cuerpo.origen : 'app' };
    const v = validarSolicitud(entrada, tiendas.map(t => t.codigo));
    if (!v.ok) return NextResponse.json({ error: v.errores.join('. '), errores: v.errores }, { status: 400 });
    const fotos = leerFotos(v.datos.fotos);
    if (!fotos.ok) return NextResponse.json({ error: fotos.errores.join('. '), errores: fotos.errores }, { status: 400 });

    const codigo = tiendas.find(t => t.codigo.toUpperCase() === v.datos.codigoTienda.toUpperCase())!.codigo;
    const clientOpId = v.datos.clientOpId ?? null;

    // Idempotencia: el reenvío de la cola offline trae el mismo `clientOpId`. Si la solicitud ya
    // llegó —y lo que se perdió fue la respuesta— se devuelve la que existe, sin crear otra.
    if (clientOpId) {
      const ya = await solicitudPorOp(sb, clientOpId);
      if (ya) {
        await completarFotosSiFaltan(sb, persona, ya, fotos.fotos);
        return NextResponse.json({ id: ya.id, yaExistia: true });
      }
    }

    // Las fotos se suben ANTES de crear la fila: una solicitud no se puede borrar (trigger
    // `mant_prohibir_borrado`), así que si la subida falla después, quedaría para siempre una
    // solicitud sin fotos. Al revés, si falla el INSERT, se limpian los archivos.
    const id = crypto.randomUUID();
    const subidas = await subirFotos(sb, { id, codigo }, fotos.fotos);
    if (!subidas.ok) {
      return NextResponse.json({ error: 'No se pudieron subir las fotos. Intenta de nuevo.' }, { status: 502 });
    }

    const { error: insErr } = await sb.from('mant_solicitudes').insert({
      id,
      codigo_tienda: codigo,
      categoria: v.datos.categoria?.trim() || null,
      descripcion: v.datos.descripcion,
      origen: v.datos.origen,
      creada_por: persona.id,
      creada_por_nombre: persona.name,
      client_op_id: clientOpId,
    });
    if (insErr) {
      await sb.storage.from(BUCKET_MANT).remove(subidas.rutas);
      // Dos envíos con el mismo `clientOpId` a la vez: el segundo choca con el `unique`.
      if ((insErr as { code?: string }).code === '23505' && clientOpId) {
        const ya = await solicitudPorOp(sb, clientOpId);
        if (ya) return NextResponse.json({ id: ya.id, yaExistia: true });
      }
      throw new Error(`insert mant_solicitudes: ${insErr.message}`);
    }

    const { error: fotoErr } = await sb.from('mant_fotos').insert(subidas.rutas.map(ruta => ({
      solicitud_id: id, tipo: 'antes', ruta, subida_por: persona.id, subida_por_nombre: persona.name,
    })));
    if (fotoErr) {
      // La solicitud ya existe y no se puede borrar. Se responde error para que la cola reintente:
      // el reintento entra por la idempotencia y `completarFotosSiFaltan` las vuelve a colgar.
      console.error('[mantencion] fotos sin registrar de', id, fotoErr.message);
      return NextResponse.json({ error: 'La solicitud llegó, pero las fotos no. Reintenta.' }, { status: 500 });
    }

    await anotarEventos(sb, persona, id, [{ campo: 'creada', anterior: null, nuevo: v.datos.origen }]);
    return NextResponse.json({ id, yaExistia: false });
  } catch (err) {
    console.error('[mantencion/solicitudes POST]', err);
    return NextResponse.json({ error: 'No se pudo guardar la solicitud' }, { status: 500 });
  }
}

type FotosLeidas = Extract<ReturnType<typeof leerFotos>, { ok: true }>['fotos'];

async function solicitudPorOp(sb: SupabaseClient, clientOpId: string) {
  const { data } = await sb.from('mant_solicitudes').select('id, codigo_tienda')
    .eq('client_op_id', clientOpId).limit(1).maybeSingle();
  return data as { id: string; codigo_tienda: string } | null;
}

async function subirFotos(
  sb: SupabaseClient,
  sol: { id: string; codigo: string },
  fotos: FotosLeidas,
): Promise<{ ok: true; rutas: string[] } | { ok: false }> {
  const fecha = fechaChile();
  const rutas: string[] = [];
  for (const f of fotos) {
    const ruta = rutaFoto({
      fecha, codigoTienda: sol.codigo, solicitudId: sol.id, nombre: crypto.randomUUID(), extension: f.extension,
    });
    const { error } = await sb.storage.from(BUCKET_MANT)
      .upload(ruta, Buffer.from(f.base64, 'base64'), { contentType: f.mime, upsert: false });
    if (error) {
      console.error('[mantencion] subir foto', ruta, error.message);
      if (rutas.length) await sb.storage.from(BUCKET_MANT).remove(rutas);
      return { ok: false };
    }
    rutas.push(ruta);
  }
  return { ok: true, rutas };
}

/** Si un envío anterior creó la solicitud pero no alcanzó a registrar las fotos, las cuelga ahora. */
async function completarFotosSiFaltan(
  sb: SupabaseClient,
  persona: Persona,
  sol: { id: string; codigo_tienda: string },
  fotos: FotosLeidas,
): Promise<void> {
  const { count } = await sb.from('mant_fotos').select('id', { count: 'exact', head: true }).eq('solicitud_id', sol.id);
  if ((count ?? 0) > 0 || fotos.length === 0) return;
  const subidas = await subirFotos(sb, { id: sol.id, codigo: sol.codigo_tienda }, fotos);
  if (!subidas.ok) return;
  const { error } = await sb.from('mant_fotos').insert(subidas.rutas.map(ruta => ({
    solicitud_id: sol.id, tipo: 'antes', ruta, subida_por: persona.id, subida_por_nombre: persona.name,
  })));
  if (error) console.error('[mantencion] completar fotos de', sol.id, error.message);
}
