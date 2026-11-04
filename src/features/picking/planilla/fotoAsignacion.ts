// Qué movimientos hay que fotografiar, y con qué datos. Módulo puro.
//
// ── POR QUÉ SE FOTOGRAFÍA ─────────────────────────────────────────────────────────────────────
//
// El conteo de registros de un movimiento BAJA cuando el picker lo valida, y las líneas se borran:
// contar `stock.move` sin filtrar estado devuelve el mismo número reducido. Medido el 03/11/2026
// sobre los mismos 221 movimientos a dos horas de distancia: 52 bajaron, 0 subieron, todos en el
// salto `assigned → done`. 10TRQ Congelados pasó de 50 a 20.
//
// Así que «el número que se le asignó» solo existe si se guardó mientras el movimiento todavía
// estaba `assigned`. Después no hay de dónde sacarlo.
//
// ── SOLO SE FOTOGRAFÍA LO ASIGNADO ────────────────────────────────────────────────────────────
//
// Un movimiento que la primera vez ya se ve `done` NO se guarda. Su número ya bajó, y meterlo en
// una columna que dice «al asignar» sería escribir algo que no es cierto. La planilla cae al
// número en vivo para esos, y puede marcarlo.
//
// Tampoco se fotografía lo que no tiene `user_assigned_date`: sin saber cuándo se asignó, no hay
// nada que la foto esté capturando.
//
// ── NO HAY TAREA PROGRAMADA ───────────────────────────────────────────────────────────────────
//
// La pantalla de Picking ya le pide a Odoo el día entero cada 3 minutos mientras alguien la tiene
// abierta, y en el CD está abierta todo el día. La foto se escribe desde esa consulta, sin
// agregarle ni una llamada a Odoo. Esta función decide qué insertar; quien la llama hace el INSERT
// ignorando los choques con lo ya guardado (la foto se toma una sola vez por movimiento).

import { categoriaDeOrigin } from '@/features/despacho/shared/aperturaOdoo';
import { resolveStoreCode } from '@/features/picking/picking-utils';
import { SECCIONES, type SeccionPlanilla } from './armarPlanilla';

/** Lo que hace falta de un picking de Odoo para decidir si se fotografía. */
export interface PickingParaFoto {
  name: string;
  origin: string;
  state: string;
  toLocation: string;
  partner: string;
  /** `move_ids.length`: el número que muestra Odoo. */
  lineTotal: number;
  responsible: string;
  assignedAt: string | null;
  dateDone: string | null;
}

/** Una fila lista para insertar en `planilla_movimientos`. */
export interface FotoAsignacion {
  fecha: string;
  ref: string;
  cod: string;
  seccion: SeccionPlanilla;
  registros_odoo: number;
  picker_odoo: string;
  asignado_en: string;
  capturado_en: string;
}

const ES_SECCION = new Set<string>(SECCIONES);

/**
 * Las fotos a guardar de un día.
 *
 * `yaGuardados` son las referencias que ya tienen fila: se saltan sin tocarlas, porque la foto es
 * de la primera vez. `ahora` queda registrado para poder saber después cuándo se capturó.
 */
export function fotosACapturar(
  pickings: PickingParaFoto[],
  fecha: string,
  yaGuardados: ReadonlySet<string>,
  ahora: Date,
): FotoAsignacion[] {
  const out: FotoAsignacion[] = [];
  const capturadoEn = ahora.toISOString();

  for (const p of pickings) {
    // Solo lo que está asignado AHORA: un `done` ya tiene el número bajo.
    if (p.state !== 'assigned') continue;
    // Sin hora de asignación no hay nada que fotografiar.
    if (!p.assignedAt) continue;
    if (yaGuardados.has(p.name)) continue;

    const seccion = categoriaDeOrigin(p.origin);
    if (!seccion || !ES_SECCION.has(seccion)) continue;

    const cod = resolveStoreCode({ toLocation: p.toLocation, origin: p.origin, partner: p.partner });
    if (!cod) continue;

    out.push({
      fecha,
      ref: p.name,
      cod,
      seccion: seccion as SeccionPlanilla,
      registros_odoo: p.lineTotal,
      picker_odoo: p.responsible,
      asignado_en: p.assignedAt,
      capturado_en: capturadoEn,
    });
  }

  return out;
}
