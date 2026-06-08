import type { OdooConfig, OperacionOdoo, ProductoOdoo } from '../types';

// config parameter kept for API compatibility but credentials are NOT sent to the server —
// the /api/odoo proxy reads them from server-side env vars only.
export async function buscarOperaciones(_config: OdooConfig, query: string): Promise<OperacionOdoo[]> {
  const res = await fetch('/api/odoo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'search_operations', query }),
  });
  const data = (await res.json()) as { operations?: OperacionOdoo[]; error?: string };
  if (!res.ok) throw new Error(data.error || 'Error al consultar Odoo');
  return data.operations ?? [];
}

export async function buscarProducto(
  _config: OdooConfig,
  codigo: string,
  pickings?: string[],
): Promise<ProductoOdoo | null> {
  const res = await fetch('/api/odoo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'search_product', query: codigo, pickings }),
  });
  const data = (await res.json()) as { productos?: ProductoOdoo[]; error?: string };
  if (!res.ok) throw new Error(data.error || 'Error al buscar producto');
  return data.productos?.[0] ?? null;
}

/**
 * Devuelve solo la URL pública de Odoo (no secreta) para que los componentes
 * puedan verificar `hasOdoo = !!config.url` sin exponer credenciales al browser.
 * Las credenciales reales las lee el servidor desde env vars ODOO_* / NEXT_PUBLIC_ODOO_*.
 */
export function getOdooConfig(): OdooConfig {
  return {
    url:      process.env.NEXT_PUBLIC_ODOO_URL ?? '',
    db:       '',
    username: '',
    apiKey:   '',
  };
}

export interface PickerOdooStats {
  userId: number;
  userName: string;
  totalDone: number;
  totalAssigned: number;
  totalConfirmed: number;
  totalWaiting: number;
  doneThisWeek: number;
  discrepancias: number;
}

export async function getPickerOdooStats(
  _config: OdooConfig,
  pickerName: string,
): Promise<PickerOdooStats | null> {
  const res = await fetch('/api/odoo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'get_picker_stats', query: pickerName }),
  });
  const data = (await res.json()) as { stats?: PickerOdooStats | null; error?: string };
  if (!res.ok) throw new Error(data.error || 'Error al obtener stats de picker');
  return data.stats ?? null;
}
