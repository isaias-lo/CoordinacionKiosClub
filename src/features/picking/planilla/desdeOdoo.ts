// De lo que devuelve `planilla_dia` a lo que consume `armarPlanilla`. Módulo puro.
//
// ── LO QUE NO SE PUEDE LEER SE DESCARTA ───────────────────────────────────────────────────────
//
// El `origin` es texto escrito a mano en Odoo. La sección sale de `categoriaDeOrigin`, que ya cubre
// las aperturas («Abastecimiento Apertura Hogar»). Un «Merma Abastecimiento 14PF/INT/02745» no es un
// movimiento de la planilla: ponerle una sección por defecto metería una fila falsa en una hoja que
// se firma.
//
// ── EL CÓDIGO SALE DE `resolveStoreCode`, NO DE `extractStoreCode` ──────────────────────────────
//
// `extractStoreCode` solo pone en mayúsculas y aplica la regex: NO canoniza la Ñ. `resolveStoreCode`
// sí, y su comentario dice por qué: «para que el semáforo/bodega (que usan el código del catálogo,
// p. ej. "37VIÑ") hagan match aunque Odoo use otra grafía de la Ñ (p. ej. "37VIN")». Además mira
// primero `location_dest_id`, que es dato estructurado, y recién después el `origin` manual.
//
// Sin eso el fallo es SILENCIOSO: un movimiento de 23PEÑ que llegue como `23PEN` no calza con
// ninguna tienda del día, cae en `fueraDelCalendario` y la tienda aparece «sin carga» teniéndola.
//
// ── CADA TIENDA TOMA LOS MOVIMIENTOS DE SU DÍA ────────────────────────────────────────────────
//
// `planilla_dia` puede traer más de un día, porque una tienda de apertura tiene sus movimientos
// fechados en otro (62PLD los tuvo el 30/10 con la planilla del 03/11). Al traer ese día vienen
// TAMBIÉN los movimientos de las demás tiendas de esa fecha, que no son de esta hoja. `diaPorTienda`
// dice qué día le toca a cada una y acá se descarta todo lo demás. Sin este filtro, una tienda
// normal sumaría dos veces: sus movimientos de hoy y los del día de la apertura.

import { categoriaDeOrigin } from '@/features/despacho/shared/aperturaOdoo';
import { resolveStoreCode } from '@/features/picking/picking-utils';
import { SECCIONES, type MovimientoPlanilla, type SeccionPlanilla } from './armarPlanilla';

/** Un movimiento tal como lo devuelve la acción `planilla_dia`. */
export interface MovimientoOdoo {
  ref: string;
  origin: string;
  estado: string;
  registros: number;
  responsable: string;
  asignadoEn: string | null;
  validadoEn: string | null;
  /** El día que se le pidió a Odoo. Es la clave para saber a qué tienda le corresponde. */
  dia: string;
  /** `location_dest_id`: dato estructurado, la primera fuente del código de tienda. */
  toLocation: string;
  /** El partner del picking: la última fuente del código, si las dos anteriores fallan. */
  partner: string;
}

const ES_SECCION = new Set<string>(SECCIONES);

/**
 * Normaliza y descarta.
 *
 * `nombres` es el mapa de `picker_canonical_names` («Pickers 15» → «Cristobal Labra»); una cuenta
 * que no esté sale con su nombre crudo, para que se vea cuál falta configurar en vez de desaparecer.
 *
 * `diaPorTienda` es `cod → día de sus movimientos`, como lo arma `agruparConsultasPorDia`. Una
 * tienda que no esté ahí no es de esta hoja.
 */
export function movimientosDesdeOdoo(
  crudos: MovimientoOdoo[],
  nombres: Record<string, string>,
  diaPorTienda: ReadonlyMap<string, string>,
): MovimientoPlanilla[] {
  const out: MovimientoPlanilla[] = [];
  for (const m of crudos) {
    const cat = categoriaDeOrigin(m.origin);
    // Congelados tiene su propia pestaña: no es de esta planilla.
    if (!cat || !ES_SECCION.has(cat)) continue;
    const cod = resolveStoreCode({ toLocation: m.toLocation, origin: m.origin, partner: m.partner });
    if (!cod) continue;
    const suDia = diaPorTienda.get(cod);
    if (!suDia || suDia !== m.dia) continue;
    out.push({
      cod,
      seccion: cat as SeccionPlanilla,
      registros: m.registros,
      picker: m.responsable ? (nombres[m.responsable] ?? m.responsable) : '',
      asignadoEn: m.asignadoEn,
      validadoEn: m.validadoEn,
      estado: m.estado,
    });
  }
  return out;
}
