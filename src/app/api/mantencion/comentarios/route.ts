import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyPersona } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { tiendasDe } from '@/lib/mantencionServer';
import { tiposDeComentario, veTodo } from '@/features/mantencion/utils/permisoMantencion';
import { comentarioDeFila, type FilaComentario } from '@/features/mantencion/utils/filas';
import { TIPOS_COMENTARIO } from '@/features/mantencion/tipos';

/**
 * POST /api/mantencion/comentarios — suma un comentario a una solicitud.
 *
 * La tienda responde; Mantención pregunta y deja notas para el técnico (`tiposDeComentario`). Lo
 * que la tienda escribió al crear la solicitud no se edita nunca: toda aclaración entra por acá.
 */
export const dynamic = 'force-dynamic';

const Cuerpo = z.object({
  solicitudId: z.string().uuid(),
  tipo: z.enum(TIPOS_COMENTARIO),
  texto: z.string().trim().min(1, 'Escribe algo').max(2000, 'El texto es demasiado largo'),
});

export async function POST(request: NextRequest) {
  const persona = await verifyPersona(request);
  if (!persona) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const r = Cuerpo.safeParse(await request.json().catch(() => null));
  if (!r.success) {
    return NextResponse.json({ error: r.error.issues.map(i => i.message).join('. ') }, { status: 400 });
  }
  const { solicitudId, tipo, texto } = r.data;
  if (!tiposDeComentario(persona.role).includes(tipo)) {
    return NextResponse.json({ error: 'No puedes escribir ese tipo de comentario' }, { status: 403 });
  }

  try {
    const sb = supabaseServer();
    const { data: sol, error: solErr } = await sb.from('mant_solicitudes')
      .select('id, codigo_tienda').eq('id', solicitudId).maybeSingle();
    if (solErr) throw new Error(`mant_solicitudes: ${solErr.message}`);
    if (!sol) return NextResponse.json({ error: 'La solicitud no existe' }, { status: 404 });

    if (!veTodo(persona.role)) {
      const mias = await tiendasDe(sb, persona);
      const cod = String(sol.codigo_tienda).toUpperCase();
      if (!mias.some(t => t.codigo.toUpperCase() === cod)) {
        return NextResponse.json({ error: 'Esa solicitud no es de tus tiendas' }, { status: 403 });
      }
    }

    const { data, error } = await sb.from('mant_comentarios').insert({
      solicitud_id: solicitudId, autor_id: persona.id, autor_nombre: persona.name, tipo, texto,
    }).select('id, solicitud_id, tipo, texto, autor_nombre, created_at').single();
    if (error) throw new Error(`insert mant_comentarios: ${error.message}`);
    return NextResponse.json({ comentario: comentarioDeFila(data as FilaComentario) });
  } catch (err) {
    console.error('[mantencion/comentarios]', err);
    return NextResponse.json({ error: 'No se pudo guardar el comentario' }, { status: 500 });
  }
}
