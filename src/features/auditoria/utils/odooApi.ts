import type { OdooConfig, OperacionOdoo, ProductoOdoo } from '../types';

export async function buscarOperaciones(config: OdooConfig, query: string): Promise<OperacionOdoo[]> {
  const res = await fetch('/api/odoo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'search_operations', config, query }),
  });
  const data = (await res.json()) as { operations?: OperacionOdoo[]; error?: string };
  if (!res.ok) throw new Error(data.error || 'Error al consultar Odoo');
  return data.operations ?? [];
}

export async function buscarProducto(
  config: OdooConfig,
  codigo: string,
  pickings?: string[],
): Promise<ProductoOdoo | null> {
  const res = await fetch('/api/odoo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'search_product', config, query: codigo, pickings }),
  });
  const data = (await res.json()) as { productos?: ProductoOdoo[]; error?: string };
  if (!res.ok) throw new Error(data.error || 'Error al buscar producto');
  return data.productos?.[0] ?? null;
}

export function getOdooConfig(): OdooConfig | null {
  try {
    const raw = localStorage.getItem('odooConfig');
    if (!raw) return null;
    return JSON.parse(raw) as OdooConfig;
  } catch {
    return null;
  }
}

export function saveOdooConfig(config: OdooConfig): void {
  localStorage.setItem('odooConfig', JSON.stringify(config));
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
  config: OdooConfig,
  pickerName: string,
): Promise<PickerOdooStats | null> {
  const res = await fetch('/api/odoo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'get_picker_stats', config, query: pickerName }),
  });
  const data = (await res.json()) as { stats?: PickerOdooStats | null; error?: string };
  if (!res.ok) throw new Error(data.error || 'Error al obtener stats de picker');
  return data.stats ?? null;
}
