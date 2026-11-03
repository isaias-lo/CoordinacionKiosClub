// De los movimientos de Odoo a las filas de la planilla. Módulo puro: sin red ni UI.
//
// ── UNA FILA POR TIENDA, Y LAS REPETIDAS EN LA MISMA CELDA ────────────────────────────────────
//
// La primera versión le daba una fila EXTRA a la tienda cuando una sección tenía dos movimientos,
// y dejaba las otras tres secciones en gris al lado. No es el papel: el coordinador escribe los dos
// números en la MISMA celda («en el SP2 hogar de Marcelo en la hoja tengo 62 y 46»). Medido el
// 03/11/2026: pasa en 7 tiendas de 29, y siempre en una sola sección por tienda.
//
// ── QUÉ CUENTA COMO TRABAJO ───────────────────────────────────────────────────────────────────
//
// Solo `assigned` y `done`. Un `cancel` es trabajo anulado y un `confirmed` todavía no tiene stock
// liberado. Mostrarlos daba líneas fantasma: 27MCH aparecía con dos movimientos de Comida cuando
// tiene uno. Medido el 03/11 sobre las tiendas del día: de 194 movimientos son trabajo 119, y
// quedan fuera 50 anulados y 25 sin liberar. Los descartados se devuelven contados, no escondidos:
// la hoja dice al pie cuántos hay.

import type { ZonaPlanilla } from './zonaPlanilla';

export type Seccion = 'Comida' | 'Aseo' | 'Hogar' | 'Chocolates';

/** El orden de las columnas, igual que en el papel. */
export const SECCIONES: Seccion[] = ['Comida', 'Aseo', 'Hogar', 'Chocolates'];

/** Un movimiento de Odoo con lo que la planilla necesita, ya normalizado. */
export interface MovimientoPlanilla {
  cod: string;
  seccion: Seccion;
  /** `move_ids.length`: el número que muestra Odoo. NO el `lineCount` filtrado por estado. */
  registros: number;
  /** El nombre ya traducido por `picker_canonical_names`; `''` si todavía no se asignó. */
  picker: string;
  asignadoEn: string | null;
  validadoEn: string | null;
  estado: string;
}

export interface CeldaPlanilla { registros: number; picker: string }

export interface FilaPlanilla {
  cod: string;
  zona: ZonaPlanilla;
  celdas: Record<Seccion, CeldaPlanilla[]>;
  /** Está en el calendario del día y no tiene ningún movimiento real. */
  sinCarga: boolean;
}

export interface Planilla {
  filas: FilaPlanilla[];
  totales: Record<Seccion, number>;
  descartados: { anulados: number; sinLiberar: number };
  /** Movimientos de tiendas que no son del día. Se ignoran, pero se cuentan. */
  fueraDelDia: number;
}

/** Los dos estados que son trabajo real. */
const ESTADOS_REALES = new Set(['assigned', 'done']);

/** Los asignados primero, en orden de asignación; los sin asignar al final. */
function porAsignacion(a: MovimientoPlanilla, b: MovimientoPlanilla): number {
  if (!a.asignadoEn && !b.asignadoEn) return 0;
  if (!a.asignadoEn) return 1;
  if (!b.asignadoEn) return -1;
  return a.asignadoEn < b.asignadoEn ? -1 : a.asignadoEn > b.asignadoEn ? 1 : 0;
}

function celdasVacias(): Record<Seccion, CeldaPlanilla[]> {
  return { Comida: [], Aseo: [], Hogar: [], Chocolates: [] };
}

/**
 * Las filas de la planilla, una por tienda del día y en ese mismo orden.
 *
 * `tiendas` viene ya ordenada como el calendario (Regiones, Costa, RM) y con su zona resuelta.
 */
export function armarPlanilla(
  movimientos: MovimientoPlanilla[],
  tiendas: Array<{ cod: string; zona: ZonaPlanilla }>,
): Planilla {
  const porCod = new Map<string, MovimientoPlanilla[]>();
  for (const t of tiendas) porCod.set(t.cod, []);

  const descartados = { anulados: 0, sinLiberar: 0 };
  let fueraDelDia = 0;

  for (const m of movimientos) {
    if (m.estado === 'cancel')    { descartados.anulados++;   continue; }
    if (m.estado === 'confirmed') { descartados.sinLiberar++; continue; }
    if (!ESTADOS_REALES.has(m.estado)) continue;
    const lista = porCod.get(m.cod);
    if (!lista) { fueraDelDia++; continue; }
    lista.push(m);
  }

  const totales: Record<Seccion, number> = { Comida: 0, Aseo: 0, Hogar: 0, Chocolates: 0 };

  const filas: FilaPlanilla[] = tiendas.map(t => {
    const suyos = porCod.get(t.cod) ?? [];
    const celdas = celdasVacias();
    for (const s of SECCIONES) {
      celdas[s] = suyos
        .filter(m => m.seccion === s)
        .sort(porAsignacion)
        .map(m => ({ registros: m.registros, picker: m.picker }));
      for (const c of celdas[s]) totales[s] += c.registros;
    }
    return { cod: t.cod, zona: t.zona, celdas, sinCarga: suyos.length === 0 };
  });

  return { filas, totales, descartados, fueraDelDia };
}
