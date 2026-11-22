import { NextRequest, NextResponse } from 'next/server';
import { verifyPersona } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { registrarCambio } from '@/lib/bitacoraServer';
import { veTodo } from '@/features/mantencion/utils/permisoMantencion';
import { AjustesSchema, configDeFila, filaDeConfig } from '@/features/mantencion/utils/ajustes';

/**
 * /api/mantencion/ajustes — los umbrales y pesos del tablero, y las categorías sugeridas.
 *
 *   GET    config y categorías (todas, activas o no, con su id).
 *   PATCH  guarda la config. Cada cambio queda en la bitácora general (`bitacora_cambios`).
 *
 * «Umbrales y pesos editables por Jesús, guardados en base de datos, nunca en el código»: la fila
 * única `mant_config` (id = 1) es la verdad; `CONFIG_POR_DEFECTO` solo cubre una lectura fallida.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const persona = await verifyPersona(request);
  if (!persona) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!veTodo(persona.role)) return NextResponse.json({ error: 'Solo Mantención' }, { status: 403 });

  try {
    const sb = supabaseServer();
    const [cfg, cats] = await Promise.all([
      sb.from('mant_config').select('*').eq('id', 1).maybeSingle(),
      sb.from('mant_categorias').select('id, nombre, activa, orden').order('orden').order('nombre'),
    ]);
    if (cfg.error) throw new Error(`mant_config: ${cfg.error.message}`);
    if (cats.error) throw new Error(`mant_categorias: ${cats.error.message}`);
    return NextResponse.json({
      config: configDeFila(cfg.data as Record<string, unknown> | null),
      actualizado: cfg.data ? { en: cfg.data.updated_at, por: cfg.data.updated_by_name } : null,
      categorias: cats.data ?? [],
    });
  } catch (err) {
    console.error('[mantencion/ajustes GET]', err);
    return NextResponse.json({ error: 'No se pudieron cargar los ajustes' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const persona = await verifyPersona(request);
  if (!persona) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!veTodo(persona.role)) return NextResponse.json({ error: 'Solo Mantención' }, { status: 403 });

  const r = AjustesSchema.safeParse(await request.json().catch(() => null));
  if (!r.success) {
    return NextResponse.json({ error: 'Algún valor está fuera de rango' }, { status: 400 });
  }

  try {
    const sb = supabaseServer();
    const { data: antes } = await sb.from('mant_config').select('*').eq('id', 1).maybeSingle();
    const fila = filaDeConfig(r.data);
    const { error } = await sb.from('mant_config')
      .upsert({ id: 1, ...fila, updated_by_name: persona.name });
    if (error) throw new Error(`mant_config: ${error.message}`);
    await registrarCambio({
      actor: { id: persona.id, name: persona.name },
      entidad: 'mantencion_config', entidadId: '1', accion: 'editar',
      antes: antes as Record<string, unknown> | null, despues: fila,
    });
    return NextResponse.json({ config: configDeFila(fila) });
  } catch (err) {
    console.error('[mantencion/ajustes PATCH]', err);
    return NextResponse.json({ error: 'No se pudieron guardar los ajustes' }, { status: 500 });
  }
}
