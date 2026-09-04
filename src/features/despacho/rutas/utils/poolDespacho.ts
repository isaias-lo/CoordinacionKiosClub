import type { StoreItem } from './routing';
import { enElPool } from './pool';

/** Fila del calendario activo por tienda. OJO: acá `c` es la cantidad de CONTENEDORES (number),
 *  distinto del `c` de StoreItem, que es el CÓDIGO de tienda (string). */
export interface CalTData { on: boolean; p: number; b: number; c: number; ch: number; g?: string }

/**
 * Arma el pool de despacho desde el calendario activo con los CUATRO tipos de carga.
 *
 * Reglas (ver PASO 2):
 *  - Se incluyen las tiendas activas con CUALQUIER tipo > 0 (pallets, bultos, contenedores o
 *    chocolates). Antes el filtro pedía `p>0 || b>0`, así que las tiendas de SOLO contenedores o
 *    SOLO chocolates se perdían — y los chocolates son el 31% de lo que sale de bodega.
 *  - `p` (piso/capacidad) = pallets + contenedores: un contenedor ocupa piso como un pallet.
 *  - `b` = bultos, `ch` = chocolates. La capacidad se mide SOLO en pallets (`p`); bultos y
 *    chocolates no limitan, pero viajan con la tienda para que el enrutador los reparta.
 *
 * Puro y testeable. `c` de entrada = contenedores (number); `c` de salida = código (string).
 */
export function poolDesdeCalT(calT: Record<string, CalTData>): StoreItem[] {
  return Object.keys(calT)
    .filter(cod => enElPool(calT[cod]))
    .map(cod => {
      const d = calT[cod];
      return { c: cod, p: d.p + (d.c ?? 0), b: d.b, ch: d.ch ?? 0 };
    });
}
