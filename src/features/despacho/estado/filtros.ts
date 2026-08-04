export interface FiltroFila {
  /** Fecha ISO seleccionada ('' = sin filtro de fecha). */
  date: string;
  /** true en la pestaña Recepción (filtra por created_at); false filtra por `fecha` (DD/MM/YYYY). */
  isRecepcion: boolean;
  /** Fecha en formato DD/MM/YYYY para comparar contra `row.fecha`. */
  displayDate: string;
  /** Texto de búsqueda libre ('' = sin búsqueda). */
  search: string;
  /** Columnas donde buscar el texto. */
  searchKeys: string[];
  /** Estado de seguimiento a filtrar desde el semáforo ('' = todos). */
  segFilter: string;
}

/**
 * Predicado puro para filtrar una fila del panel Estado/Registros: combina filtro por fecha,
 * filtro por estado de seguimiento (chips del semáforo, clickables) y búsqueda de texto.
 * Puro y testeable; reutilizado por `SeguimientoPanel`.
 */
export function coincideFila(row: Record<string, unknown>, f: FiltroFila): boolean {
  const matchDate = !f.date || (f.isRecepcion
    ? String(row.created_at ?? '').startsWith(f.date)
    : String(row.fecha ?? '') === f.displayDate);
  const matchSeg = !f.segFilter || String(row.seguimiento ?? '') === f.segFilter;
  const q = f.search.toLowerCase();
  const matchSearch = !f.search || f.searchKeys.some(k => String(row[k] ?? '').toLowerCase().includes(q));
  return matchDate && matchSeg && matchSearch;
}
