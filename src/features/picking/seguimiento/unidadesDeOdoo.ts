// Las unidades y las líneas de cada movimiento, a partir de lo que devuelve el `read_group` de
// `stock.move.line`. Módulo puro: entra la respuesta de Odoo, sale un índice por id.
//
// ── POR QUÉ ESTO VIVE APARTE, Y NO EN EL HANDLER ──────────────────────────────────────────────
//
// Esta traducción era tres líneas dentro de `api/odoo/route.ts` y ahí estuvo el error más caro de
// esta pantalla: sumaba `qty_done`, que en este Odoo es un campo **calculado y no almacenado**.
//
//     fields_get (09/11/2026) → qty_done  store: false   ·   quantity  store: true
//
// `read_group` solo sabe agregar columnas de la base. Con un campo no almacenado **no da error**:
// devuelve el grupo sin esa clave. Y `g.qty_done ?? 0` convertía esa ausencia en un cero
// perfectamente creíble. La columna «Unidades» mostró 0 para todo el mundo; con ella el
// «Prom./op.», la barra de «Unidades por picker», y el CPH con el que `tendencia.ts` dice si
// alguien sube o baja — que es la misma métrica con la que se paga el bono.
//
// La diferencia entre «no hay unidades» y «Odoo no mandó el campo» es justamente la que un `?? 0`
// borra. Por eso acá se cuentan aparte: `sinCantidad` es lo que permite que la pantalla avise en
// vez de dibujar ceros.

/** Un grupo tal como lo devuelve `read_group` agrupando `stock.move.line` por `picking_id`. */
export interface GrupoMoveLine {
  /** `[id, nombre]`, o `false` en las líneas sin movimiento padre. */
  picking_id: [number, string] | false;
  /** La suma de `quantity`. **Ausente** si se pidió un campo que Odoo no puede agregar. */
  quantity?: number;
  /** Cuántas líneas cayeron en el grupo: los «registros» del movimiento. */
  picking_id_count?: number;
}

export interface UnidadesPorMovimiento {
  /** Por id de movimiento: unidades movidas y líneas escaneadas. */
  porId: Record<number, { units: number; lines: number }>;
  /** Grupos en los que Odoo NO devolvió la cantidad agregada. Ver la cabecera. */
  sinCantidad: number;
  /** Grupos leídos, descontando los que no tienen movimiento padre. */
  grupos: number;
}

/**
 * El índice por id, y de paso cuántos grupos llegaron sin la cantidad.
 *
 * Un grupo sin `picking_id` no se puede atribuir a nadie y se descarta — pero tampoco se cuenta
 * en `grupos`, para que `sinCantidad === grupos` signifique exactamente «Odoo no mandó el campo
 * en ninguno» y no se confunda con un día raro.
 */
export function unidadesPorMovimiento(grupos: readonly GrupoMoveLine[]): UnidadesPorMovimiento {
  const porId: Record<number, { units: number; lines: number }> = {};
  let sinCantidad = 0;
  let contados = 0;

  for (const g of grupos) {
    if (!Array.isArray(g.picking_id)) continue;
    contados++;
    if (typeof g.quantity !== 'number') sinCantidad++;
    porId[g.picking_id[0]] = {
      units: typeof g.quantity === 'number' ? g.quantity : 0,
      lines: g.picking_id_count ?? 0,
    };
  }

  return { porId, sinCantidad, grupos: contados };
}

/**
 * ¿Hay que avisar de que las unidades no son de fiar?
 *
 * Solo cuando **ningún** grupo trajo la cantidad: eso ya no es un dato faltante, es el campo
 * que cambió de nombre o dejó de estar almacenado, y todos los ceros de la pantalla son falsos.
 * Que a algunos grupos les falte es otra cosa y no se grita.
 */
export function unidadesSonDudosas(u: UnidadesPorMovimiento): boolean {
  return u.grupos > 0 && u.sinCantidad === u.grupos;
}
