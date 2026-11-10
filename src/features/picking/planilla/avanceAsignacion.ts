// Cuánto del día ya tiene dueño y cuánto falta repartir. Módulo puro.
//
// ── QUÉ CUENTA COMO «SIN ASIGNAR» ─────────────────────────────────────────────────────────────
//
// Un movimiento sin nombre de picker. Nada más. No se mira el estado, y es a propósito:
//
//   - Medido contra Odoo el 10/11/2026, los movimientos sin responsable del día estaban TODOS en
//     `assigned` — 18 de 18 ese día, 2 de 2 el 09/11, y 0 el 05/11 y el 28/10. Así que en la
//     práctica «sin nombre» y «assigned sin tomar» son el mismo conjunto.
//   - Un `done` sin nombre no se vio nunca. Pero si apareciera hay que VERLO, no esconderlo:
//     una celda sin nombre tampoco se puede escribir en la hoja de olas, así que es trabajo
//     que igual queda pendiente de resolver. Filtrar por estado lo haría desaparecer del
//     contador justo en el caso raro, que es cuando un contador sirve.
//
// ── EL PORCENTAJE NO REDONDEA HACIA LA MENTIRA ────────────────────────────────────────────────
//
// 499 de 500 redondea a 100 y la barra se ve llena con trabajo sin repartir; 1 de 500 trunca a 0
// y se ve sin empezar. Las dos son la misma falla: el contador diciendo lo contrario de lo que
// pasa, justo en los bordes. Por eso 100 se reserva para cuando no falta NINGUNO, y 0 para
// cuando no hay NINGUNO asignado.

import { SECCIONES, type MovimientoPlanilla, type SeccionPlanilla } from './armarPlanilla';

export interface FaltaPorSeccion {
  seccion: SeccionPlanilla;
  faltan: number;
}

export interface AvanceAsignacion {
  /** Todos los movimientos del día que llegaron a la hoja. */
  total: number;
  asignados: number;
  sinAsignar: number;
  /** 0 a 100. 100 solo si no falta ninguno; 0 solo si no hay ninguno asignado. */
  pct: number;
  /** Lo que falta, por sección y en el orden de la hoja. Las secciones completas no aparecen. */
  porSeccion: FaltaPorSeccion[];
  /** En cuántas TIENDAS distintas falta algo. «18 en 3 tiendas» dice a cuántos lugares ir. */
  tiendas: number;
}

/** Un movimiento tiene dueño cuando tiene un nombre que no sea espacios. */
function tieneDueno(m: MovimientoPlanilla): boolean {
  return (m.picker ?? '').trim() !== '';
}

/**
 * El avance de asignación de una lista de movimientos.
 *
 * Recibe los movimientos que la pantalla está mostrando —filtrados o no— y no los modifica.
 * Un día sin movimientos devuelve `pct: 100`, porque un día vacío no es un día con todo por
 * repartir; la pantalla igual lo muestra distinto.
 */
export function avanceAsignacion(movs: readonly MovimientoPlanilla[]): AvanceAsignacion {
  const total = movs.length;
  const faltan = new Map<string, number>();
  const tiendas = new Set<string>();
  let sinAsignar = 0;

  for (const m of movs) {
    if (tieneDueno(m)) continue;
    sinAsignar++;
    faltan.set(m.seccion, (faltan.get(m.seccion) ?? 0) + 1);
    const cod = (m.cod ?? '').trim().toUpperCase();
    if (cod) tiendas.add(cod);
  }

  const asignados = total - sinAsignar;

  // Ver la cabecera: los dos bordes se reservan para los dos casos absolutos.
  let pct: number;
  if (total === 0 || sinAsignar === 0) pct = 100;
  else if (asignados === 0) pct = 0;
  else pct = Math.min(99, Math.max(1, Math.floor((asignados / total) * 100)));

  const porSeccion = SECCIONES
    .map(s => ({ seccion: s, faltan: faltan.get(s) ?? 0 }))
    .filter(x => x.faltan > 0);

  return { total, asignados, sinAsignar, pct, porSeccion, tiendas: tiendas.size };
}
