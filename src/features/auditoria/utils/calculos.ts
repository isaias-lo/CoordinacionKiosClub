import type { TipoError } from '../types';

/**
 * Cantidad real auditada de un producto a partir de las unidades reportadas.
 * Un faltante resta de lo esperado; un sobrante suma.
 */
export function calcAuditado(unidades: number, tipo: TipoError, esperado: number): number {
  return tipo === 'faltante' ? esperado - unidades : esperado + unidades;
}
