import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { format, subDays } from 'date-fns';

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

async function fetchHistorial(days = 30): Promise<HistorialEntry[]> {
  const since = format(subDays(new Date(), days), 'yyyy-MM-dd');
  const { data, error } = await supabase
    .from('dispatch_history')
    .select('id, date, total_pallets, total_bultos, total_contenedores, total_chocolates, created_at, user_id')
    .gte('date', since)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return data ?? [];
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
