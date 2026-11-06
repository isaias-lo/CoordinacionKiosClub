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

import type { OrigenBackorder } from './backorders';
import type { ZonaPlanilla } from './zonaPlanilla';

/**
 * Las cuatro secciones de la planilla, con los valores que devuelve `categoriaDeOrigin`.
 *
 * Se llama `SeccionPlanilla` y no `Seccion` porque `picking-secciones.ts` ya exporta un `Seccion`
 * con los valores en minúscula y con `congelados` incluido. Son dos cosas distintas: ese describe
 * las secciones de la pantalla de Picking, y este las cuatro columnas de la hoja.
 */
export type SeccionPlanilla = 'Comida' | 'Aseo' | 'Hogar' | 'Chocolates';

/** El orden de las columnas, igual que en el papel. */
export const SECCIONES: SeccionPlanilla[] = ['Comida', 'Aseo', 'Hogar', 'Chocolates'];

/** Un movimiento de Odoo con lo que la planilla necesita, ya normalizado. */
export interface MovimientoPlanilla {
  /**
   * El código CANÓNICO del catálogo, como lo devuelve `resolveStoreCode`. Acá se compara con
   * `===` contra el de la tienda: un código sin canonizar («23PEN» en vez de «23PEÑ») no calzaría
   * con ninguna y la tienda saldría «sin carga» teniéndola, sin ningún aviso.
   */
  cod: string;
  seccion: SeccionPlanilla;
  /**
   * El número que muestra Odoo en su columna «registros»: `move_line_ids.length`.
   *
   * NO `move_ids` —esa es la demanda— ni el `lineCount` filtrado por estado. Este comentario
   * decía `move_ids` y estaba mal: se corrigió en el #779 después de que la hoja dijera 33 en un
   * movimiento que Odoo mostraba con 16.
   */
  registros: number;
  /** El nombre ya traducido por `picker_canonical_names`; `''` si todavía no se asignó. */
  picker: string;
  /**
   * La CUENTA de Odoo sin traducir («Pickers 18», «Adquisiciones»).
   *
   * Se conserva además del nombre porque la hoja de olas la escribe en su columna S, y esa
   * columna es la LLAVE con que el bono cruza: `PICKING!T = CONCATENATE(fecha; S)`. El nombre
   * se puede corregir a mano; la cuenta no, porque es el dato que va a traer Odoo del otro lado
   * del cruce. Ver `registroOlas.ts`.
   */
  cuenta?: string;
  asignadoEn: string | null;
  /**
   * La hora de validación. Este módulo no la usa —la matriz no muestra horas—, pero es parte de la
   * forma compartida del movimiento: la vista Detalle y el CSV consumen la MISMA lista de
   * movimientos, no las celdas, así que no hay dos listas en paralelo que mantener.
   */
  validadoEn: string | null;
  estado: string;
  /** La referencia de Odoo (`99REC/DT/146059`). Es lo que identifica el movimiento al corregir
   *  quién lo hizo. Las líneas agregadas a mano no tienen. */
  ref?: string;
  /** El id de su fila en `planilla_movimientos`, si tiene una. */
  id?: number;
  /** De dónde salió lo que se muestra: Odoo en vivo o una corrección a mano.
   *  Lo pone `conCorrecciones`; la pantalla lo usa para marcar la celda. */
  origen?: 'vivo' | 'foto' | 'corregido' | 'manual';
  /** El picker que decía Odoo, cuando el que se muestra es una corrección. */
  pickerOdoo?: string;
  /** De qué movimiento quedó este, cuando es un backorder. Ver `backorders.ts`. */
  backorderDe?: OrigenBackorder;
}

export interface CeldaPlanilla {
  registros: number;
  picker: string;
  /** La referencia de Odoo del movimiento de esta celda: es lo que se manda al corregir. */
  ref?: string;
  /** El id de su fila en `planilla_movimientos`, si ya se corrigió antes. */
  id?: number;
  origen?: MovimientoPlanilla['origen'];
  /** Lo que decía Odoo antes de corregir. Se muestra al lado del nombre nuevo. */
  pickerOdoo?: string;
  /** De qué movimiento quedó. Una celda con esto NO es trabajo sin empezar. */
  backorderDe?: OrigenBackorder;
  /** Cuándo se asignó y cuándo se validó: es de donde sale el contador de la celda.
   *  Ver `relojDe` en `horasPlanilla.ts` — el contador es una resta contra el reloj, no un
   *  cronómetro que haya que arrancar y guardar. */
  asignadoEn?: string | null;
  validadoEn?: string | null;
}

export interface FilaPlanilla {
  cod: string;
  zona: ZonaPlanilla;
  celdas: Record<SeccionPlanilla, CeldaPlanilla[]>;
  /** Está en el calendario del día y no tiene ningún movimiento real. */
  sinCarga: boolean;
}

export interface Planilla {
  filas: FilaPlanilla[];
  totales: Record<SeccionPlanilla, number>;
  /**
   * Lo que no entró a la hoja, contado. Ninguna rama descarta en silencio: `otros` junta los
   * estados que no son ninguno de los cuatro conocidos —`waiting`, por ejemplo—, porque una hoja
   * que se firma no puede perder un movimiento sin dejar rastro.
   */
  descartados: { anulados: number; sinLiberar: number; otros: number };
  /** Movimientos de tiendas que no están en el calendario del día. Se ignoran, pero se cuentan. */
  fueraDelCalendario: number;
}

/**
 * Los dos estados que son trabajo real.
 *
 * No es lo mismo que `PICKEABLE_STATES` de `picking-utils.ts`, que agrega
 * `partially_available`: esa es la lista blanca del semáforo y mira `stock.move`, mientras que
 * acá se miran `stock.picking`, donde ese estado no existe.
 */
const ESTADOS_REALES = new Set(['assigned', 'done']);

/**
 * Los asignados primero, en orden de asignación; los sin asignar al final.
 *
 * Compara las fechas como TEXTO, lo que vale solo porque son el naive UTC de Odoo
 * («YYYY-MM-DD HH:MM:SS»): ancho fijo y de mayor a menor significancia, así que el orden
 * lexicográfico y el cronológico coinciden. Con cualquier otro formato habría que parsear.
 *
 * Se exporta porque la vista Detalle y el CSV ordenan con el MISMO criterio. Estaba escrita tres
 * veces —acá, en `csvPlanilla` y en el tab— y tres copias de un comparador son tres formas de
 * que el papel y la pantalla terminen con las filas en distinto orden.
 */
export function porAsignacion(a: MovimientoPlanilla, b: MovimientoPlanilla): number {
  if (!a.asignadoEn && !b.asignadoEn) return 0;
  if (!a.asignadoEn) return 1;
  if (!b.asignadoEn) return -1;
  return a.asignadoEn < b.asignadoEn ? -1 : a.asignadoEn > b.asignadoEn ? 1 : 0;
}

function celdasVacias(): Record<SeccionPlanilla, CeldaPlanilla[]> {
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
  // Una tienda repetida en la entrada daría DOS filas con la misma carga y, peor, sumaría su carga
  // dos veces en los totales: la hoja firmada mostraría el doble. `todayStores` deduplica los
  // adelantos contra el calendario, pero el calendario mismo no lo garantiza, así que se hace acá.
  const unicas: Array<{ cod: string; zona: ZonaPlanilla }> = [];
  const vistas = new Set<string>();
  for (const t of tiendas) {
    if (vistas.has(t.cod)) continue;
    vistas.add(t.cod);
    unicas.push(t);
  }

  const porCod = new Map<string, MovimientoPlanilla[]>();
  for (const t of unicas) porCod.set(t.cod, []);

  const descartados = { anulados: 0, sinLiberar: 0, otros: 0 };
  let fueraDelCalendario = 0;

  for (const m of movimientos) {
    if (m.estado === 'cancel')    { descartados.anulados++;   continue; }
    if (m.estado === 'confirmed') { descartados.sinLiberar++; continue; }
    // Cualquier otro estado —`waiting`, `draft`— también se cuenta: ninguna rama descarta callada.
    if (!ESTADOS_REALES.has(m.estado)) { descartados.otros++; continue; }
    const lista = porCod.get(m.cod);
    if (!lista) { fueraDelCalendario++; continue; }
    lista.push(m);
  }

  const filas: FilaPlanilla[] = unicas.map(t => {
    const suyos = porCod.get(t.cod) ?? [];
    const celdas = celdasVacias();
    for (const s of SECCIONES) {
      celdas[s] = suyos
        .filter(m => m.seccion === s)
        .sort(porAsignacion)
        .map(m => ({ registros: m.registros, picker: m.picker, ref: m.ref, id: m.id,
                     origen: m.origen, pickerOdoo: m.pickerOdoo, backorderDe: m.backorderDe,
                     asignadoEn: m.asignadoEn, validadoEn: m.validadoEn }));
    }
    return { cod: t.cod, zona: t.zona, celdas, sinCarga: suyos.length === 0 };
  });

  return { filas, totales: totalesDeFilas(filas), descartados, fueraDelCalendario };
}

/**
 * Los totales por sección, sumados DE LAS FILAS.
 *
 * Sale de las filas y no de un acumulador dentro del `map` de arriba: así el total no puede
 * divergir de lo que la hoja muestra.
 *
 * Se exporta porque `filtrarPlanilla` los recalcula sobre las filas que quedan. Con una segunda
 * copia de esta suma, el día que cambie una —por ejemplo si los chocolates dejaran de sumar
 * registros— la pantalla filtrada y la sin filtrar mostrarían totales distintos.
 */
export function totalesDeFilas(filas: FilaPlanilla[]): Record<SeccionPlanilla, number> {
  const totales: Record<SeccionPlanilla, number> = { Comida: 0, Aseo: 0, Hogar: 0, Chocolates: 0 };
  for (const fila of filas) {
    for (const s of SECCIONES) {
      for (const c of fila.celdas[s]) totales[s] += c.registros;
    }
  }
  return totales;
}
