// Registrar el día de la planilla en la hoja PICKING de «Abastecimiento por Olas».
//
// ── UN SOLO ENDPOINT, DOS MODOS, EL MISMO CÁLCULO ─────────────────────────────────────────────
//
// Sin `confirmar`, devuelve el plan y no escribe nada: es la vista previa. Con `confirmar: true`,
// calcula el MISMO plan y lo escribe. No son dos caminos: es uno, y el preview muestra
// literalmente las celdas que se van a escribir. Un preview calculado aparte terminaría, tarde o
// temprano, prometiendo una cosa y escribiendo otra.
//
// ── POR QUÉ LOS MOVIMIENTOS LLEGAN DEL CLIENTE ────────────────────────────────────────────────
//
// La pantalla ya los tiene: pidió el día a Odoo, tradujo las cuentas con `picker_canonical_names`
// y aplicó las correcciones a mano. Rehacer esa cadena acá sería una segunda copia que puede
// divergir, y entonces se registraría algo distinto de lo que el coordinador está mirando.
//
// Lo que el cliente NO decide es el nombre que se escribe: eso sale de `nombre_olas` en la base,
// acá en el servidor. El cliente manda quién hizo qué; el servidor resuelve con qué nombre se
// escribe eso en esa planilla, que es de lo que depende el bono.
//
// ── LO QUE SE ESCRIBE ES DOS COLUMNAS ─────────────────────────────────────────────────────────
//
// F (Pistolero) y S (Usuario), y solo dentro del bloque del día. `escribirCeldas` lo vuelve a
// verificar antes de llamar a la API. El porqué está en `registroOlas.ts`.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyActor } from '@/lib/apiAuth';
import {
  BloqueNoEncontrado, SinPermisoDeEscritura, correoDeServicio, crearBloqueDia, escribirCeldas,
  leerBloqueDia, leerColaHoja,
} from '@/lib/olasSheet';
import { planRegistro } from '@/features/picking/planilla/registroOlas';
import { colorAlternado, describirEsqueleto, filasEsqueleto }
  from '@/features/picking/planilla/esqueletoOlas';
import { SECCIONES, type MovimientoPlanilla, type SeccionPlanilla }
  from '@/features/picking/planilla/armarPlanilla';

const ES_SECCION = new Set<string>(SECCIONES);

/** El mismo texto para los dos caminos que pueden chocar con la falta de permiso. */
const sinPermiso = (e: SinPermisoDeEscritura) =>
  `La planilla de olas está compartida solo para lectura. Hay que darle permiso de Editor a ` +
  `${e.correo} desde el botón «Compartir» del documento.`;

interface MovimientoEntrante {
  cod?: unknown; seccion?: unknown; picker?: unknown; cuenta?: unknown;
  registros?: unknown; estado?: unknown;
}

/** Deja pasar solo lo que el plan necesita, con los tipos correctos. */
function saneado(crudos: unknown): MovimientoPlanilla[] {
  if (!Array.isArray(crudos)) return [];
  const out: MovimientoPlanilla[] = [];
  for (const m of crudos as MovimientoEntrante[]) {
    const seccion = String(m?.seccion ?? '');
    if (!ES_SECCION.has(seccion)) continue;
    const cod = String(m?.cod ?? '').trim();
    if (!cod) continue;
    out.push({
      cod,
      seccion: seccion as SeccionPlanilla,
      registros: Number(m?.registros ?? 0) || 0,
      picker: String(m?.picker ?? ''),
      cuenta: m?.cuenta == null ? undefined : String(m.cuenta),
      asignadoEn: null, validadoEn: null,
      estado: String(m?.estado ?? ''),
    });
  }
  return out;
}

export async function POST(request: NextRequest) {
  const actor = await verifyActor(request);
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let body: { fecha?: unknown; movimientos?: unknown; confirmar?: unknown;
              crear?: unknown; cods?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  const fecha = String(body.fecha ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 });
  }
  const movimientos = saneado(body.movimientos);
  if (movimientos.length === 0) {
    return NextResponse.json({ error: 'No llegó ningún movimiento del día' }, { status: 400 });
  }

  // El nombre con que cada persona se escribe EN ESA PLANILLA. Sale de la base, nunca del
  // cliente: es lo que decide a quién le suma el bono.
  const sb = supabaseServer();
  const { data: nombres, error: eNombres } = await sb
    .from('picker_canonical_names')
    .select('display_name, nombre_olas');
  if (eNombres) {
    console.error('[planilla-olas] nombres', eNombres);
    return NextResponse.json({ error: 'No se pudieron leer los nombres' }, { status: 500 });
  }
  const porPersona = new Map<string, string>();
  for (const r of nombres ?? []) {
    if (r.display_name && r.nombre_olas) porPersona.set(String(r.display_name), String(r.nombre_olas));
  }

  // Las tiendas del día, en el orden del calendario: es lo que haría falta para armar el bloque
  // si todavía no existe.
  const cods = Array.isArray(body.cods)
    ? (body.cods as unknown[]).filter((c): c is string => typeof c === 'string' && !!c.trim())
    : [];

  let bloque;
  try {
    bloque = await leerBloqueDia(fecha);
  } catch (e) {
    if (!(e instanceof BloqueNoEncontrado)) {
      console.error('[planilla-olas] leer', e);
      return NextResponse.json({ error: 'No se pudo leer la planilla de olas' }, { status: 502 });
    }

    // ── El día no está en la hoja ──
    //
    // Hasta el 06/11/2026 una persona precargaba el esqueleto y acá solo se avisaba. Desde que
    // eso dejó de hacerse, el sistema lo arma. Se crea SOLO si el día no existe: buscarlo
    // primero es lo que impide duplicarlo, y un día duplicado no daría error —el XLOOKUP del
    // bono se queda con la primera coincidencia— daría un número mal.
    const esqueleto = cods.length ? filasEsqueleto(cods, movimientos) : [];
    if (body.crear !== true || esqueleto.length === 0) {
      return NextResponse.json({
        ok: false, motivo: 'sin-bloque',
        puedeCrear: esqueleto.length > 0,
        aCrear: esqueleto.length ? describirEsqueleto(esqueleto) : null,
        error: `No encontré filas con fecha ${fecha} en la hoja PICKING de «Abastecimiento por Olas». ` +
               (e.cercanas.length
                 ? `Las últimas fechas que sí tiene son: ${e.cercanas.join(', ')}. `
                 : ''),
      }, { status: 409 });
    }

    try {
      const cola = await leerColaHoja();
      const color = colorAlternado(cola.colorAnterior);
      const creado = await crearBloqueDia(fecha, esqueleto, color, cola);
      console.log(`[planilla-olas] ${actor.name} creó ${fecha}: filas ${creado.desde}-${creado.hasta}`);
      // Se vuelve a LEER lo recién creado en vez de darlo por hecho: lo que se rellena después
      // tiene que salir de la hoja, no de lo que creímos escribir.
      bloque = await leerBloqueDia(fecha);
    } catch (e2) {
      if (e2 instanceof SinPermisoDeEscritura) {
        return NextResponse.json({ ok: false, motivo: 'sin-permiso', error: sinPermiso(e2) }, { status: 403 });
      }
      console.error('[planilla-olas] crear', e2);
      return NextResponse.json({ error: 'No se pudo crear el día en la planilla de olas' }, { status: 502 });
    }
  }

  const plan = planRegistro(movimientos, bloque.filas, porPersona);

  // Sin confirmar: la vista previa. No se escribe nada.
  if (body.confirmar !== true) {
    return NextResponse.json({
      ok: true, modo: 'previo', fecha,
      bloque: { desde: bloque.desde, hasta: bloque.hasta, filas: bloque.filas.length },
      ...plan,
    });
  }

  try {
    const celdas = await escribirCeldas(plan.escrituras);
    console.log(`[planilla-olas] ${actor.name} registró ${fecha}: ${celdas} celdas`);
    return NextResponse.json({
      ok: true, modo: 'escrito', fecha, celdas,
      bloque: { desde: bloque.desde, hasta: bloque.hasta, filas: bloque.filas.length },
      ...plan,
    });
  } catch (e) {
    if (e instanceof SinPermisoDeEscritura) {
      return NextResponse.json({ ok: false, motivo: 'sin-permiso', error: sinPermiso(e) }, { status: 403 });
    }
    console.error('[planilla-olas] escribir', e);
    return NextResponse.json({ error: 'No se pudo escribir en la planilla de olas' }, { status: 502 });
  }
}

/** GET — solo informa a quién hay que darle permiso, para poder mostrarlo sin intentar escribir. */
export async function GET(request: NextRequest) {
  const actor = await verifyActor(request);
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return NextResponse.json({ ok: true, cuenta: correoDeServicio() });
}
