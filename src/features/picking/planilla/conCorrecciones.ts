// Fusiona las tres fuentes de un número de la planilla. Módulo puro.
//
// ── POR QUÉ HAY TRES ──────────────────────────────────────────────────────────────────────────
//
// 1. **Odoo en vivo.** Lo que el endpoint trae hoy. Es la única fuente que dice qué movimientos
//    EXISTEN: si uno se anuló, deja de venir y deja de ser trabajo.
// 2. **La foto al asignar** (`planilla_movimientos.registros_odoo`). El conteo BAJA cuando el
//    picker valida y las líneas se borran —medido el 03/11/2026: 52 movimientos bajaron, 0
//    subieron—, así que el número de la asignación solo existe si se guardó a tiempo.
// 3. **La corrección del coordinador.** Manda sobre las otras dos, y también sobre los KPI: si se
//    corrige es porque Odoo estaba equivocado.
//
// ── EL ORDEN DE PRECEDENCIA, Y POR QUÉ NO SE COLAPSA ──────────────────────────────────────────
//
// corrección → foto → vivo. Cada movimiento sale con `origen`, así la pantalla puede marcar de
// dónde viene el número en vez de mostrar tres cosas distintas con la misma cara.
//
// Se usa `??` y no `||` a propósito: una corrección de **0** es un cero, no «sin corregir». Con
// `||` volvería al número de Odoo y nadie entendería por qué la corrección «no se guardó».
//
// ── QUÉ EXISTE LO DECIDE ODOO, CON UNA EXCEPCIÓN ──────────────────────────────────────────────
//
// Una fila guardada cuyo movimiento ya no viene de Odoo NO revive: se anuló después de
// fotografiarla. La excepción son las líneas que el coordinador agregó a mano (`ref` nulo), para
// algo que se pickeó y no quedó en Odoo: esas aparecen siempre.

import type { MovimientoPlanilla } from './armarPlanilla';

/** De dónde salió el número que se muestra. */
export type OrigenDato = 'vivo' | 'foto' | 'corregido' | 'manual';

/** Una fila de `planilla_movimientos`, ya normalizada. */
export interface FilaGuardada {
  id: number;
  /** La referencia de Odoo, o `null` si el coordinador agregó la línea a mano. */
  ref: string | null;
  cod: string;
  seccion: MovimientoPlanilla['seccion'];
  /** La foto: lo que decía Odoo cuando el movimiento estaba asignado. No se toca. */
  registrosOdoo: number | null;
  pickerOdoo: string | null;
  asignadoEn: string | null;
  /** La corrección del coordinador. `null` = no se corrigió. */
  registros: number | null;
  picker: string | null;
}

/** Un movimiento de Odoo del día, con su referencia. */
type MovimientoVivo = MovimientoPlanilla & { ref: string };

/**
 * Los movimientos de la hoja, con el número que corresponde y de dónde salió.
 *
 * `vivos` son los de Odoo ya normalizados; `guardados` las filas de `planilla_movimientos` de ese
 * día. El orden conserva el de `vivos` y agrega al final las líneas hechas a mano.
 */
export function conCorrecciones(
  vivos: MovimientoVivo[],
  guardados: FilaGuardada[],
): MovimientoPlanilla[] {
  const porRef = new Map<string, FilaGuardada>();
  const aMano: FilaGuardada[] = [];
  for (const g of guardados) {
    if (g.ref) porRef.set(g.ref, g);
    else aMano.push(g);
  }

  const out: MovimientoPlanilla[] = vivos.map(v => {
    const g = porRef.get(v.ref);
    if (!g) return { ...v, origen: 'vivo' as OrigenDato };

    const corregido = g.registros !== null || g.picker !== null;
    return {
      ...v,
      id: g.id,
      registros: g.registros ?? g.registrosOdoo ?? v.registros,
      picker: g.picker ?? v.picker,
      // Lo que decía Odoo, para mostrarlo al lado del nombre corregido. Sale de la fila guardada,
      // que lo capturó al corregir; si esa fila es vieja y no lo tiene, se cae a lo que Odoo dice
      // hoy, que es lo más cercano.
      pickerOdoo: g.picker !== null ? (g.pickerOdoo ?? v.picker) : undefined,
      origen: (corregido ? 'corregido' : g.registrosOdoo !== null ? 'foto' : 'vivo') as OrigenDato,
    };
  });

  for (const g of aMano) {
    out.push({
      id: g.id,
      cod: g.cod,
      seccion: g.seccion,
      registros: g.registros ?? 0,
      picker: g.picker ?? '',
      asignadoEn: g.asignadoEn,
      validadoEn: null,
      // `assigned` para que `armarPlanilla` la cuente como trabajo real: una línea que el
      // coordinador agregó a mano es trabajo que se hizo, aunque Odoo no lo tenga.
      estado: 'assigned',
      origen: 'manual',
    });
  }

  return out;
}
