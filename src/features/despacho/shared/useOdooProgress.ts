'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

export type StoreProgress = { total: number; done: number; status: 'none' | 'partial' | 'complete' };

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Hook compartido: devuelve el progreso de Odoo por tienda (total ops, done ops, status).
 * La data la escribe PickingScreen después de cargar ops de Odoo.
 * Se actualiza en tiempo real vía Supabase Realtime.
 *
 * Reemplaza usePickingReady para los indicadores de color en Bodega (Santiago/Regiones).
 */
export function useOdooProgress(): Map<string, StoreProgress> {
  const [map, setMap] = useState<Map<string, StoreProgress>>(new Map());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/picking-store-progress?date=${todayISO()}`);
      if (!res.ok) return;
      const json = await res.json() as { stores: Record<string, StoreProgress> };
      const next = new Map<string, StoreProgress>();
      for (const [cod, info] of Object.entries(json.stores)) {
        next.set(cod, info);
      }
      setMap(next);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('odoo-progress-shared')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picking_session_state', filter: `tipo=eq.odoo-progress` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return map;
}
