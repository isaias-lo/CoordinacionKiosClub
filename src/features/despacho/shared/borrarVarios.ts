// «Eliminar marcados» en la barra de sumar de Bodega (Nacional y RM/Costa). Puro.
//
// Pedido de Isaias del 4/11/2026: al marcar varios chocolates, poder borrarlos de una vez. La barra
// tuvo un «Eliminar» hasta el 19/10 y se sacó a pedido suyo (ver `BarraSumarBultos.tsx`); vuelve con
// confirmación que nombra cada unidad y con Deshacer.
//
// El estado de la tienda se borra por índice, uno a la vez. Borrar de menor a mayor corre los que
// siguen y el segundo borrado caería en otro ítem; por eso los índices van de mayor a menor, y sin
// repetir (dos tarjetas de la misma unidad no pueden borrar dos ítems, ver `unidadesSinRepetir.ts`).

/** Los índices de `items` que corresponden a `filas`, únicos y de mayor a menor. */
export function indicesABorrar<I, F>(items: readonly I[], filas: readonly F[], esDe: (item: I, fila: F) => boolean): number[] {
  const idx = new Set<number>();
  for (const f of filas) {
    const i = items.findIndex(it => esDe(it, f));
    if (i !== -1) idx.add(i);
  }
  return [...idx].sort((a, b) => b - a);
}
