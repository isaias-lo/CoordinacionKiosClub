'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

export type StoreProgress = {
  total: number;
  done: number;
  congTotal: number;
  congDone: number;
  status: 'none' | 'partial' | 'complete';
};

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
      const json = await res.json() as { stores: Record<string, Partial<StoreProgress> & Pick<StoreProgress, 'total' | 'done' | 'status'>> };
      const next = new Map<string, StoreProgress>();
      for (const [cod, info] of Object.entries(json.stores)) {
        // congTotal/congDone: defaultear a 0 por si una respuesta vieja no los trae.
        next.set(cod, { ...info, congTotal: info.congTotal ?? 0, congDone: info.congDone ?? 0 });
      }
      setMap(next);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Re-consulta periódica (60 s) mientras la bodega está abierta: mantiene el
  // semáforo al día y dispara el refresco batch throttleado del servidor, sin
  // depender de que alguien tenga Picking abierto. La llamada a Odoo la limita
  // el TTL del endpoint (máx 1/min en total), así que esto NO sobrecarga.
  useEffect(() => {
    const id = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 800);
    };
    const channel = supabase
      .channel(`odoo-progress-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picking_session_state', filter: `tipo=eq.odoo-progress` }, debounced)
      .subscribe();
    return () => { supabase.removeChannel(channel); if (timer) clearTimeout(timer); };
  }, [load]);

  return map;
}
