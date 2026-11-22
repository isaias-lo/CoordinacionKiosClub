import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyPersona } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { registrarCambio } from '@/lib/bitacoraServer';
import { veTodo } from '@/features/mantencion/utils/permisoMantencion';
import { nombreCategoria } from '@/features/mantencion/utils/ajustes';

/**
 * /api/mantencion/categorias — la lista sugerida que el supervisor ve al crear una solicitud.
 *
 *   POST   { nombre }        agrega una, o reactiva la que ya existía con ese nombre.
 *   PATCH  { id, activa }    la quita de la lista (o la vuelve a poner).
 *
 * Quitar NO borra: las solicitudes viejas guardan la categoría como texto y no se tocan, y la
 * bitácora tiene que poder decir que existió. Por eso es `activa = false`.
 */
export const dynamic = 'force-dynamic';

async function autorizar(request: NextRequest) {
  const persona = await verifyPersona(request);
  if (!persona) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (!veTodo(persona.role)) return { error: NextResponse.json({ error: 'Solo Mantención' }, { status: 403 }) };
  return { persona };
}

export async function POST(request: NextRequest) {
  const a = await autorizar(request);
  if (a.error) return a.error;
  const cuerpo = await request.json().catch(() => null) as { nombre?: unknown } | null;
  const nombre = nombreCategoria(cuerpo?.nombre);
  if (!nombre) return NextResponse.json({ error: 'Escribe un nombre de hasta 60 letras' }, { status: 400 });

  try {
    const sb = supabaseServer();
    // El nombre es `unique` en la base: si ya existe (activa o quitada), se reactiva en vez de chocar.
    const { data: ya } = await sb.from('mant_categorias').select('id, nombre, activa')
      // `ilike` sin comodines: un `%` o `_` en el nombre no puede coincidir con otra categoría.
      .ilike('nombre', nombre.replace(/[\\%_]/g, m => `\\${m}`)).limit(1).maybeSingle();
    if (ya) {
      if (!ya.activa) {
        const { error } = await sb.from('mant_categorias').update({ activa: true }).eq('id', ya.id);
        if (error) throw new Error(error.message);
        await registrarCambio({
          actor: { id: a.persona.id, name: a.persona.name }, entidad: 'mantencion_categoria',
          entidadId: String(ya.id), accion: 'editar', antes: { activa: false }, despues: { activa: true },
        });
      }
      return NextResponse.json({ categoria: { ...ya, activa: true } });
    }
    const { data: max } = await sb.from('mant_categorias').select('orden')
      .order('orden', { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await sb.from('mant_categorias')
      .insert({ nombre, activa: true, orden: ((max?.orden as number | undefined) ?? 0) + 1 })
      .select('id, nombre, activa, orden').single();
    if (error) throw new Error(error.message);
    await registrarCambio({
      actor: { id: a.persona.id, name: a.persona.name }, entidad: 'mantencion_categoria',
      entidadId: String(data.id), accion: 'crear', despues: { nombre, activa: true },
    });
    return NextResponse.json({ categoria: data });
  } catch (err) {
    console.error('[mantencion/categorias POST]', err);
    return NextResponse.json({ error: 'No se pudo guardar la categoría' }, { status: 500 });
  }
}

const Cambio = z.object({ id: z.number().int().positive(), activa: z.boolean() });

export async function PATCH(request: NextRequest) {
  const a = await autorizar(request);
  if (a.error) return a.error;
  const r = Cambio.safeParse(await request.json().catch(() => null));
  if (!r.success) return NextResponse.json({ error: 'Cambio inválido' }, { status: 400 });

  try {
    const sb = supabaseServer();
    const { data: antes } = await sb.from('mant_categorias').select('id, nombre, activa').eq('id', r.data.id).maybeSingle();
    if (!antes) return NextResponse.json({ error: 'La categoría no existe' }, { status: 404 });
    const { error } = await sb.from('mant_categorias').update({ activa: r.data.activa }).eq('id', r.data.id);
    if (error) throw new Error(error.message);
    await registrarCambio({
      actor: { id: a.persona.id, name: a.persona.name }, entidad: 'mantencion_categoria',
      entidadId: String(r.data.id), accion: 'editar',
      antes: { nombre: antes.nombre, activa: antes.activa }, despues: { nombre: antes.nombre, activa: r.data.activa },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[mantencion/categorias PATCH]', err);
    return NextResponse.json({ error: 'No se pudo guardar el cambio' }, { status: 500 });
  }
}
