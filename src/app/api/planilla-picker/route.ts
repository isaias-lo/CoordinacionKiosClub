// Corregir a mano quién hizo un movimiento de la planilla de Picking.
//
// ── POR QUÉ EXISTE ────────────────────────────────────────────────────────────────────────────
//
// En Odoo el responsable de un movimiento es la CUENTA de la pistola, no la persona, y una pistola
// se presta. `picker_canonical_names` ya traduce la cuenta a su dueño habitual; esto cubre la
// excepción: el día que alguien usó la pistola de otro.
//
// Solo se corrige el PICKER. Las cantidades salen de lo validado en Odoo, que es lo que la persona
// efectivamente hizo, y no se tocan.
//
// ── POR QUÉ NO SE PISA EL DATO DE ODOO ────────────────────────────────────────────────────────
//
// `picker_odoo` guarda lo que Odoo decía en el momento de corregir, y no se vuelve a escribir. Es
// la lección de CRUCE PESOS, ya documentada en este repositorio: cuando una columna que dice
// «medido» se llena con algo escrito a mano, se pierde para siempre cuál era cuál.
//
// `editado_por` sale de la sesión, en el servidor. No se acepta del cliente: si alguien pudiera
// mandarlo, el rastro de quién corrigió no valdría nada.
//
// La tabla tiene RLS activo y SIN políticas, así que todo pasa por acá con service role.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyActor } from '@/lib/apiAuth';
import { validarCorreccion, type PedidoCorreccion } from '@/features/picking/planilla/correccionPicker';
import { SECCIONES, type SeccionPlanilla } from '@/features/picking/planilla/armarPlanilla';

const ES_SECCION = new Set<string>(SECCIONES);

/** POST — guarda la corrección de una celda. Una celda = un movimiento de Odoo. */
export async function POST(request: NextRequest) {
  const actor = await verifyActor(request);
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let body: Partial<PedidoCorreccion>;
  try {
    body = (await request.json()) as Partial<PedidoCorreccion>;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  const seccion = String(body.seccion ?? '');
  if (!ES_SECCION.has(seccion)) {
    return NextResponse.json({ error: 'Sección inválida' }, { status: 400 });
  }

  const pedido: PedidoCorreccion = {
    ref:          String(body.ref ?? '').trim(),
    fecha:        String(body.fecha ?? '').trim(),
    cod:          String(body.cod ?? '').trim().toUpperCase(),
    seccion:      seccion as SeccionPlanilla,
    pickerActual: String(body.pickerActual ?? ''),
    pickerNuevo:  String(body.pickerNuevo ?? ''),
  };

  // La misma validación que ya corrió la pantalla. Se repite acá porque el cliente se puede
  // saltar: lo que llega por la red nunca es de fiar.
  const v = validarCorreccion(pedido);
  if (!v.ok) return NextResponse.json({ error: v.motivo }, { status: 400 });

  const sb = supabaseServer();
  const ahora = new Date().toISOString();

  // `picker_odoo` solo se escribe la primera vez: guarda lo que decía Odoo antes de que nadie
  // tocara nada. Por eso va en el INSERT y no en el UPDATE.
  const { data: existente, error: eLeer } = await sb
    .from('planilla_movimientos')
    .select('id, picker_odoo')
    .eq('fecha', pedido.fecha)
    .eq('ref', pedido.ref)
    .maybeSingle();

  if (eLeer) {
    console.error('[POST /api/planilla-picker] leer', eLeer);
    return NextResponse.json({ error: 'No se pudo leer la corrección anterior' }, { status: 500 });
  }

  const comun = {
    picker:      pedido.pickerNuevo.trim(),
    editado_por: actor.name,
    editado_en:  ahora,
  };

  const { data, error } = existente
    ? await sb.from('planilla_movimientos')
        .update(comun).eq('id', existente.id)
        .select('id, picker, picker_odoo, editado_por, editado_en').single()
    : await sb.from('planilla_movimientos')
        .insert({
          ...comun,
          fecha: pedido.fecha, ref: pedido.ref, cod: pedido.cod, seccion: pedido.seccion,
          picker_odoo: pedido.pickerActual.trim() || null,
          capturado_en: ahora,
        })
        .select('id, picker, picker_odoo, editado_por, editado_en').single();

  if (error) {
    console.error('[POST /api/planilla-picker] guardar', error);
    return NextResponse.json({ error: 'No se pudo guardar la corrección' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, fila: data });
}

/** GET — las correcciones de un día, para que la hoja las aplique sobre lo que trae Odoo. */
export async function GET(request: NextRequest) {
  const actor = await verifyActor(request);
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const fecha = request.nextUrl.searchParams.get('fecha') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 });
  }

  const sb = supabaseServer();
  const { data, error } = await sb
    .from('planilla_movimientos')
    .select('id, ref, cod, seccion, registros_odoo, picker_odoo, asignado_en, registros, picker, editado_por, editado_en')
    .eq('fecha', fecha);

  if (error) {
    console.error('[GET /api/planilla-picker]', error);
    return NextResponse.json({ error: 'No se pudieron leer las correcciones' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, filas: data ?? [] });
}
