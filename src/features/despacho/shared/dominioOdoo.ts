// Qué le pide el sistema a Odoo cuando pregunta «qué despachó el CD ese día».
//
// Vive acá y no en `lib/crucePesosDia.ts` por el mismo motivo que `sumaPesosBodega`: lo usan DOS
// caminos —la app (al registrar) y el cargador de días pasados (`scripts/cargar-cruce-pesos.mts`)—
// y `crucePesosDia` arrastra `supabaseServer`, que un script suelto no puede importar.
//
// Hasta el 07/10/2026 el cargador tenía SU PROPIA consulta a Odoo, con su propio filtro. Su
// encabezado decía «nada de lógica propia: si hubiera dos copias, una podría calcular distinto que
// la otra y nadie lo notaría hasta comparar dos filas a mano». Tenía razón, y era el caso.

/** El tipo de operación de Odoo con el que el CD despacha a una tienda. */
export const TIPO_DESPACHO_A_TIENDAS = 'Despacho Tiendas';

/**
 * El dominio de Odoo que define «lo que el CD despachó ese día». PURO, para poder fijarlo.
 *
 * ── POR QUÉ NO ALCANZA `origin like 'Abastecimiento'` ──────────────────────────────────────────
 *
 * `origin` es texto libre, y los traslados ENTRE TIENDAS lo escriben igual. El 07/10/2026 el cruce
 * le abrió fila a 38SP2 —que ni siquiera estaba en el calendario— por estos movimientos:
 *
 *     38SP2/INT/01490  «Abastecimiento Comida Para SP2 desde PUC»     74,2 kg   75PUC → 38SP2
 *     38SP2/INT/01488  «Abastecimiento Chocolates para SP2 desde PUC»  19,9 kg
 *     31TLC/INT/01536  «Guía de Abastecimiento Hogar 23/09/2026»      152,6 kg
 *
 * Pucón mandándole mercadería a San Pedro. Movimientos reales, pero no son despachos del CD: el
 * cruce compara lo que salió de Recoleta contra lo que Bodega pesó, y eso no salió de Recoleta.
 * El último encima arrastra una guía del 23/09 al día de hoy.
 *
 * Medido contra Odoo del 01/08 al 07/10 (52 días): de 9.306 movimientos que traía el filtro viejo,
 * **680 (7,3 %) no eran despachos** — traslados entre tiendas, transferencias internas del CD,
 * ajustes de inventario y MERMAS (`99REC/MERMA`). Con el tipo de operación: 8.618 y cero.
 *
 * ── POR QUÉ EL TIPO Y NO EL PREFIJO DEL NOMBRE ─────────────────────────────────────────────────
 *
 * `name like '99REC/DT/'` da exactamente el mismo resultado, pero es el prefijo de una secuencia:
 * el día que el CD cambie de código, o se abra un segundo, los despachos desaparecerían del cruce
 * EN SILENCIO — peor que un sobrante, porque un sobrante se ve. El tipo de operación es lo que
 * alguien configuró en Odoo para decir «esto es un despacho a tienda».
 *
 * `picking_type_id.code = 'outgoing'` NO sirve: devuelve cero. En este Odoo el despacho del CD a
 * la tienda está tipado como movimiento interno, porque las dos bodegas son de la misma empresa.
 */
export function dominioDespachosDelDia(fechaISO: string): (string | number)[][] {
  return [
    ['picking_type_id.name', '=', TIPO_DESPACHO_A_TIENDAS],
    ['origin', 'like', 'Abastecimiento'],
    ['date_done', '>=', `${fechaISO} 00:00:00`],
    ['date_done', '<=', `${fechaISO} 23:59:59`],
    ['state', '=', 'done'],
  ];
}
