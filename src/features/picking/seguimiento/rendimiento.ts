// El rendimiento de cada picker en un período. Módulo puro: entran operaciones, salen filas.
//
// ── POR QUÉ EXISTE ────────────────────────────────────────────────────────────────────────────
//
// Esta cuenta vivía suelta dentro de `picking_stats_range` (`api/odoo/route.ts`) y estaba mal de
// tres formas que se tapaban entre sí. Medido del 27/10 al 03/11/2026 sobre 885 operaciones:
//
//  1. Medía la duración desde `scheduled_date` —el día PLANIFICADO del movimiento— y no desde que
//     el picker lo tomó. Son cosas distintas: lo planificado es una fecha de calendario.
//  2. Descartaba en silencio todo lo que no cayera entre 0 y 8 horas: 126 operaciones, el 14%.
//  3. Sumaba los minutos de las 759 que sobrevivían y dividía por las 885. El «Prom/Op» mostraba
//     180 min; el promedio de lo que de verdad contó era 210, y el real desde la asignación, 143.
//
// El mismo sesgo arrastraba a `avgSecondsPerLine` y a `cph`, que dividen minutos de un subconjunto
// por líneas y unidades de todas. Un ritmo con numerador y denominador de conjuntos distintos no
// significa nada.
//
// ── LAS DOS REGLAS QUE LO ARREGLAN ────────────────────────────────────────────────────────────
//
// **Los totales cuentan todo; los ritmos, solo lo medido.** `ops`, `units` y `lineCount` son
// totales y suman cada operación. `avgMinutesPerOp`, `avgSecondsPerLine` y `cph` son ritmos y se
// calculan únicamente sobre las operaciones que tienen las dos horas.
//
// **Nada se descarta en silencio.** Lo que no se pudo medir se devuelve contado en `sinMedir`, y
// cada fila dice en `opsMedidas` sobre cuántas se calculó su promedio. Una jornada de 14 horas es
// un dato, no un error: ya no hay techo de 8 horas.

import { duracionMinutos } from '../planilla/horasPlanilla';
import type { PickerStatRow } from '../picking-types';

/** Una operación de Odoo con lo mínimo para medir. Las fechas llegan como el naive UTC, o `false`. */
export interface OperacionCruda {
  userId: number;
  userName: string;
  /** `user_assigned_date`: cuándo se le dio el movimiento a esta persona. */
  asignadoEn: string | false | null;
  /** `date_done`: cuándo lo validó. */
  validadoEn: string | false | null;
  /** Unidades movidas y líneas escaneadas, de `stock.move.line`.
   *
   *  Las unidades salen de sumar `quantity`, NO `qty_done`: ese es calculado y no almacenado, y
   *  `read_group` lo devuelve ausente en vez de dar error. Ver `unidadesDeOdoo.ts`. */
  units: number;
  lines: number;
}

/** Lo que ya mostraba la pantalla, más sobre cuántas operaciones se calcularon los promedios. */
export interface RendimientoPicker extends PickerStatRow {
  /** Las que tenían hora de asignación y de validación. Es el divisor de los promedios. */
  opsMedidas: number;
  /**
   * Las cuentas de Odoo que aportaron a esta fila, ordenadas.
   *
   * Casi siempre es una. Cuando son dos, la fila es la suma de las dos pistolas que usó la
   * persona, y conviene que eso se vea: si no, el total sorprende al compararlo con Odoo.
   */
  cuentas: string[];
}

export interface Rendimiento {
  filas: RendimientoPicker[];
  /** Operaciones con responsable que no se pudieron medir. Se muestran, no se esconden. */
  sinMedir: number;
  /** Operaciones sin responsable en Odoo: no se le pueden cargar a nadie. */
  sinResponsable: number;
}

interface Acum {
  name: string;
  /** Las cuentas de Odoo que aportaron a esta persona. Van a la fila para poder mostrarlas. */
  cuentas: Set<string>;
  ops: number; units: number; lines: number;
  opsMedidas: number; minutosMedidos: number; unitsMedidas: number; lineasMedidas: number;
}

/**
 * Las filas por PERSONA, con los totales sobre todo y los ritmos sobre lo medido.
 *
 * `canonicos` traduce la cuenta de Odoo a la persona («Pickers 15» → «Cristobal Labra»). Sin
 * él se agrupa por cuenta, que es lo que había: una persona que usó dos pistolas en el período
 * salía en DOS filas con el mismo nombre en pantalla, porque el nombre se traducía recién al
 * dibujar. Dos filas de la misma persona no se pueden comparar con nada, y su ritmo real no
 * está en ninguna de las dos.
 *
 * La fusión tiene que pasar ACÁ y no después: `avgSecondsPerLine` y `cph` se calculan sobre las
 * líneas y unidades de lo MEDIDO, que no se publican en la fila. Juntando dos filas ya hechas
 * habría que promediar dos promedios, que da un número que no es el de nadie.
 */
export function rendimientoPorPicker(
  operaciones: OperacionCruda[],
  canonicos?: Readonly<Record<string, string>>,
): Rendimiento {
  // La clave es la persona cuando se la conoce, y la cuenta cuando no. Es texto y no el id de
  // Odoo justamente para que dos ids que son la misma persona caigan en la misma fila.
  const porUsuario = new Map<string, Acum>();
  let sinMedir = 0;
  let sinResponsable = 0;

  for (const o of operaciones) {
    if (!o.userId || !o.userName) { sinResponsable++; continue; }

    const persona = canonicos?.[o.userName] || o.userName;
    let u = porUsuario.get(persona);
    if (!u) {
      u = { name: persona, cuentas: new Set(), ops: 0, units: 0, lines: 0,
            opsMedidas: 0, minutosMedidos: 0, unitsMedidas: 0, lineasMedidas: 0 };
      porUsuario.set(persona, u);
    }
    u.cuentas.add(o.userName);

    // Totales: cuentan SIEMPRE, se haya podido medir el tiempo o no.
    u.ops++;
    u.units += o.units;
    u.lines += o.lines;

    // `duracionMinutos` ya trunca los segundos, descarta los negativos y entiende el `false`
    // de Odoo. No hay techo: una operación larga es un dato.
    const min = duracionMinutos(o.asignadoEn, o.validadoEn);
    if (min === null) { sinMedir++; continue; }
    u.opsMedidas++;
    u.minutosMedidos += min;
    u.unitsMedidas += o.units;
    u.lineasMedidas += o.lines;
  }

  const filas = [...porUsuario.values()]
    .map((u): RendimientoPicker => ({
      name: u.name,
      cuentas: [...u.cuentas].sort(),
      ops: u.ops,
      opsMedidas: u.opsMedidas,
      units: Math.round(u.units),
      lineCount: u.lines,
      totalMinutes: Math.round(u.minutosMedidos),
      avgMinutesPerOp: u.opsMedidas > 0 ? Math.round(u.minutosMedidos / u.opsMedidas) : 0,
      avgSecondsPerLine: u.lineasMedidas > 0
        ? Math.round((u.minutosMedidos * 60) / u.lineasMedidas) : 0,
      cph: u.minutosMedidos > 0 ? Math.round((u.unitsMedidas / u.minutosMedidos) * 60) : 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { filas, sinMedir, sinResponsable };
}
