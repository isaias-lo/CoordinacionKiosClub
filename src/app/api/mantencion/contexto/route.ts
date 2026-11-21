import { NextRequest, NextResponse } from 'next/server';
import { verifyPersona } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { tiendasDe } from '@/lib/mantencionServer';
import { veTodo } from '@/features/mantencion/utils/permisoMantencion';
import type { ContextoMant } from '@/features/mantencion/tipos';

/**
 * GET /api/mantencion/contexto — lo que la pantalla necesita saber de quien la abre: sus tiendas,
 * las categorías sugeridas y si ve todo.
 *
 * Un supervisor sin tiendas asignadas recibe la lista vacía, no un error: es el estado normal
 * hasta que Mantención le asigna las suyas, y la pantalla lo explica.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const persona = await verifyPersona(request);
  if (!persona) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const sb = supabaseServer();
    const [tiendas, cats] = await Promise.all([
      tiendasDe(sb, persona),
      sb.from('mant_categorias').select('nombre').eq('activa', true).order('orden').order('nombre'),
    ]);
    if (cats.error) throw new Error(`mant_categorias: ${cats.error.message}`);
    const cuerpo: ContextoMant = {
      tiendas,
      categorias: (cats.data ?? []).map(c => c.nombre as string),
      veTodo: veTodo(persona.role),
    };
    return NextResponse.json(cuerpo);
  } catch (err) {
    console.error('[mantencion/contexto]', err);
    return NextResponse.json({ error: 'No se pudo cargar Mantención' }, { status: 500 });
  }
}
