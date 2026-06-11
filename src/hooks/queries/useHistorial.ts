import { useQuery } from '@tanstack/react-query';

export interface HistorialEntry {
  id: number;
  date: string;
  total_pallets: number;
  total_bultos: number;
  total_contenedores: number;
  total_chocolates: number;
  created_at: string;
  user_id?: string;
}

// Fuente real del dashboard: agrega despacho_rm + despacho_regiones por día
// (vía /api/dashboard-stats). Antes leía la tabla `dispatch_history`, que el
// flujo actual ya no escribe (por eso el dashboard salía en 0).
async function fetchHistorial(days = 30): Promise<HistorialEntry[]> {
  const res = await fetch(`/api/dashboard-stats?days=${days}`);
  if (!res.ok) throw new Error('Error al cargar estadísticas del dashboard');
  const json = await res.json() as { data?: Omit<HistorialEntry, 'id' | 'created_at'>[] };
  return (json.data ?? []).map((r, i) => ({ id: i, created_at: '', ...r }));
}

export const HISTORIAL_KEY = (days: number) => ['historial', days] as const;

export function useHistorial(days = 30) {
  return useQuery({
    queryKey: HISTORIAL_KEY(days),
    queryFn:  () => fetchHistorial(days),
    staleTime: 60_000,
  });
}

/** Aggregated totals for the dashboard KPI cards */
export function useHistorialStats() {
  const { data = [], ...rest } = useHistorial(90);
  const stats = {
    dias:    data.length,
    pallets: data.reduce((s, r) => s + (r.total_pallets ?? 0), 0),
    bultos:  data.reduce((s, r) => s + (r.total_bultos  ?? 0), 0),
  };
  return { stats, ...rest };
}
