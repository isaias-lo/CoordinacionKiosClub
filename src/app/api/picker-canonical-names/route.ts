import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';

const UNAUTH = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 });

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  const { data, error } = await supabaseServer()
    .from('picker_canonical_names')
    .select('key, display_name, updated_by_name, updated_at')
    .order('key');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

/**
 * Guardar el nombre de una pistola, o quitarla de la lista. **Son dos cosas distintas.**
 *
 * Antes se deducían del nombre: vacío = borrar la fila. Pero la pantalla ofrece las dos por
 * separado y confirma cada una con su propio texto —«→ (sin nombre)» contra «¿Eliminar…?
 * Desaparece para todos»—, así que borrarle el nombre a una pistola la eliminaba entera. Pasó el
 * 09/11/2026 con «control interno» y «Sofia Sanchez».
 *
 * Ahora la intención viene en `accion` y no se adivina. Sin `accion` se asume `'nombre'`: una
 * pestaña vieja que todavía mande el formato anterior deja de borrar nada, que es el lado seguro.
 */
export async function POST(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  const body = await request.json() as {
    key: string; display_name: string; updated_by_name?: string; accion?: 'nombre' | 'quitar';
  };
  const sb = supabaseServer();

  const newName = body.display_name?.trim() ?? '';
  const byName  = body.updated_by_name?.trim() ?? '';

  if (body.accion === 'quitar') {
    const { error } = await sb.from('picker_canonical_names').delete().eq('key', body.key);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // `nombre_olas` es el nombre TAL COMO lo escribe la planilla del bono, y es de la PERSONA, no
  // de la pistola. Si la pistola cambia de manos, el de antes no puede sobrevivir al cambio:
  // escribiría el nombre del que se fue sobre el trabajo del que llegó, y eso no da error —el
  // XLOOKUP encuentra el nombre, el SUMIFS no, y el bono queda en cero sin que nadie se entere.
  // Sin `nombre_olas` el registro de olas SALTA esa fila y lo dice, que es lo correcto.
  const { data: previo } = await sb
    .from('picker_canonical_names').select('display_name').eq('key', body.key).maybeSingle();
  const cambioDePersona = (previo?.display_name ?? '') !== newName;

  const fila: Record<string, unknown> = {
    key: body.key, display_name: newName, updated_by_name: byName,
    updated_at: new Date().toISOString(),
  };
  if (cambioDePersona) fila.nombre_olas = null;

  const { error } = await sb
    .from('picker_canonical_names')
    .upsert(fila, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit logging handled atomically by Postgres trigger trg_picker_name_change
  return NextResponse.json({ ok: true });
}
