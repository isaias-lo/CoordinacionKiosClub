import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';

export interface PickingPallet {
  id: number;
  store_cod: string;
  state_key: string;
  picker_label: string;
  tipo: string;
  contenido: string;
  refs: string;
  created_at: string;
}

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd');
}

async function fetchPallets(date: string): Promise<PickingPallet[]> {
  const res = await fetch(`/api/picking-pallets?date=${date}`);
  if (!res.ok) throw new Error('Error al cargar pallets');
  const json = await res.json() as { data: PickingPallet[] };
  return json.data ?? [];
}

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' };
}

export const PALLETS_KEY = (date: string) => ['picking-pallets', date] as const;

export function useTodayPickingPallets() {
  const date = todayStr();
  return useQuery({
    queryKey: PALLETS_KEY(date),
    queryFn:  () => fetchPallets(date),
    refetchInterval: 30_000, // poll every 30s (supplement realtime)
  });
}

export function usePickingPalletsByDate(date: string) {
  return useQuery({
    queryKey: PALLETS_KEY(date),
    queryFn:  () => fetchPallets(date),
  });
}

export function useDeletePallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch('/api/picking-pallets', {
        method: 'DELETE',
        headers: await authHeader(),
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Error al eliminar pallet');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['picking-pallets'] });
      toast.success('Pallet eliminado');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdatePallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: { id: number; tipo?: string; contenido?: string }) => {
      const res = await fetch('/api/picking-pallets', {
        method: 'PATCH',
        headers: await authHeader(),
        body: JSON.stringify({ id, ...fields }),
      });
      if (!res.ok) throw new Error('Error al actualizar pallet');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['picking-pallets'] }),
    onError:   (err: Error) => toast.error(err.message),
  });
}
