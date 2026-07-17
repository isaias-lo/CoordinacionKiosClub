/**
 * Cuenta cuántas tiendas de una sección están "terminadas" del total del día.
 * "Terminada" = la tienda ya tiene carga registrada en bodega (al menos 1 item).
 * Es una función pura para poder testearla sin renderizar.
 */
export function sectionProgress<T>(items: T[], isDone: (t: T) => boolean): { done: number; total: number } {
  let done = 0;
  for (const it of items) if (isDone(it)) done++;
  return { done, total: items.length };
}
