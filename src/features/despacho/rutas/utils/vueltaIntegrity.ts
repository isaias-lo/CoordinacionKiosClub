// Integridad de datos de 2ª vuelta al registrar routing en despacho_rm.
//
// El Enrutador rutea por TIENDA (no por pallet): un store entra entero a un
// camión o queda pendiente. La 2ª vuelta nace de marcar un vehículo TLBD.
// Problema: el UPDATE por (fecha, cod) puede "pisar" filas ya despachadas en
// 1ª vuelta cuando se re-registra carga extra. Esta regla protege ese dato:
// en carga extra (vuelta 2) solo se actualizan filas aún SIN despachar
// (conductor vacío); las ya despachadas en vuelta 1 conservan su conductor/vuelta.

export interface DespachoRow {
  id: string;
  seguimiento: string;
  conductor: string | null;
}

export const ESTADOS_FINALES = new Set(['Entregado', 'Recibido', 'Diferencia']);

/** Devuelve los ids de filas que se deben actualizar al registrar el routing. */
export function idsActualizables(rows: DespachoRow[], vuelta?: number): string[] {
  const esCargaExtra = vuelta === 2;
  return rows
    .filter(r => !ESTADOS_FINALES.has(r.seguimiento))
    .filter(r => !esCargaExtra || !(r.conductor && r.conductor.trim()))
    .map(r => r.id);
}
