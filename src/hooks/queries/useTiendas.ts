import { useQuery } from '@tanstack/react-query';

export interface Tienda {
  codigo: string;
  nombre: string;
  region?: string;
  sector_comuna?: string;
  corredor?: string;
  tipo?: string;
  ventana?: string;
  frecuencia?: string;
  prom_por_dia?: string;
  lat?: number | null;
  lon?: number | null;
  correos?: string;
  tel_encargado?: string;
  supervisor?: string;
  tel_supervisor?: string;
  transportista?: string;
  activo?: boolean;
}

async function fetchTiendas(): Promise<Tienda[]> {
  const res = await fetch('/api/tiendas');
  if (!res.ok) throw new Error('Error al cargar tiendas');
  const json = await res.json() as { tiendas: Tienda[] };
  return json.tiendas ?? [];
}

export const TIENDAS_KEY = ['tiendas'] as const;

export function useTiendas() {
  return useQuery({
    queryKey: TIENDAS_KEY,
    queryFn:  fetchTiendas,
    staleTime: 5 * 60 * 1000, // tiendas change rarely — cache 5 min
  });
}

export function useTiendasActivas() {
  const query = useTiendas();
  return {
    ...query,
    data: query.data?.filter(t => t.activo !== false) ?? [],
  };
}
