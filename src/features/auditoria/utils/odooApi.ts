import type { OdooConfig, OperacionOdoo } from '../types';

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
