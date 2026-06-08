import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export interface Conductor {
  id: number;
  nombre: string;
  telefono?: string | null;
  empresa?: string | null;
}

async function fetchConductores(): Promise<Conductor[]> {
  const res = await fetch('/api/conductores');
  if (!res.ok) throw new Error('Error al cargar conductores');
  const json = await res.json() as { conductores: Conductor[] };
  return json.conductores;
}

export const CONDUCTORES_KEY = ['conductores'] as const;

export function useConductores() {
  return useQuery({
    queryKey: CONDUCTORES_KEY,
    queryFn:  fetchConductores,
  });
}

interface CreateConductorInput { nombre: string; telefono?: string; empresa?: string; }
interface UpdateConductorInput extends Partial<CreateConductorInput> { id: number; }

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' };
}

export function useCreateConductor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateConductorInput) => {
      const res = await fetch('/api/conductores', {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify(input),
      });
      const json = await res.json() as { conductor?: Conductor; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Error al crear');
      return json.conductor!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONDUCTORES_KEY });
      toast.success('Conductor creado');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateConductor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateConductorInput) => {
      const res = await fetch('/api/conductores', {
        method: 'PATCH',
        headers: await authHeader(),
        body: JSON.stringify(input),
      });
      const json = await res.json() as { conductor?: Conductor; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Error al actualizar');
      return json.conductor!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONDUCTORES_KEY });
      toast.success('Conductor actualizado');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteConductor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/conductores?id=${id}`, {
        method: 'DELETE',
        headers: await authHeader(),
      });
      if (!res.ok) throw new Error('Error al eliminar');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONDUCTORES_KEY });
      toast.success('Conductor eliminado');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
