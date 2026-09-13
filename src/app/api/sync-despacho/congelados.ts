// A qué tabla va cada fila de la hoja DESPACHO CONGELADOS. Puro y testeable.
//
// Congelados tiene UNA hoja pero DOS tablas destino, porque cruza los dos catálogos: las tiendas
// de RM/Costa van a `despacho_rm` y las Nacional a `despacho_regiones`. Al escribir no hay duda —
// el sub-tab abierto dice cuál es (`body.tabla`). Al sincronizar sí: la hoja no guarda de qué
// sub-tab salió la fila, así que hay que deducirlo del código de tienda.
//
// La zona entra como función para que esto no dependa de los catálogos y se pueda testear con
// tiendas inventadas.

/** Mínimo que necesita el reparto. Los registros reales traen muchos más campos. */
export interface FilaConCod { cod?: string | null }

export interface RepartoCongelados<T> {
  rm: T[];
  regiones: T[];
  /** Códigos que no están en NINGÚN catálogo: no se pueden ubicar, y se avisan en vez de tragarlos. */
  huerfanos: string[];
}

/**
 * Reparte las filas entre las dos tablas.
 *
 * Una fila sin `cod`, o con un código que no está en ningún catálogo, NO se manda a una tabla al
 * azar: se devuelve en `huerfanos`. Meterla en la que sea la haría aparecer en el despacho de una
 * zona que no le toca, y eso es más difícil de notar que un dato que falta.
 */
export function repartirCongelados<T extends FilaConCod>(
  filas: T[],
  esNacional: (cod: string) => boolean,
  esSantiago: (cod: string) => boolean,
): RepartoCongelados<T> {
  const rm: T[] = [];
  const regiones: T[] = [];
  const huerfanos: string[] = [];

  for (const f of filas) {
    const cod = String(f.cod ?? '').trim().toUpperCase();
    if (!cod)                 { huerfanos.push('(sin código)'); continue; }
    if (esNacional(cod))      { regiones.push(f); continue; }
    if (esSantiago(cod))      { rm.push(f);       continue; }
    huerfanos.push(cod);
  }

  return { rm, regiones, huerfanos };
}
