'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { fechaISOLocal } from './fechaLocal';

export interface TerminadaInfo {
  terminada: boolean;
  por?: string;
  at?: number;
}

const TIPO = 'tienda-terminada';

/**
 * Marca manual "Tienda Terminada" por tienda — SOLO un marcador informativo (fase 1): no bloquea
 * ninguna edición en Bodega, se puede seguir agregando/editando carga igual. Sirve para que
 * /conteo-flota (persona de flota externa) muestre un verde de "lista para despachar" con
 * confirmación humana, distinto del semáforo algorítmico que ya existe.
 *
 * Reusa `picking_session_state` (mismo patrón que `useOdooProgress` — cero tabla/migración
 * nueva): `tipo='tienda-terminada'`, `state_key=store_cod`, `date=fechaISOLocal()`, y el valor
 * (terminada/por/at) va serializado en `picker_label` como ya hace 'odoo-progress'.
 */
export function useTiendaTerminada(): {
  terminadas: Map<string, TerminadaInfo>;
  marcarTerminada: (cod: string, terminada: boolean, por?: string) => Promise<void>;
} {
  const [map, setMap] = useState<Map<string, TerminadaInfo>>(new Map());

  const load = useCallback(async () => {
    try {
      const date = fechaISOLocal();
      const res = await fetch(`/api/picking-session-state?date=${date}&tipo=${TIPO}`);
      if (!res.ok) return;
      const json = await res.json() as { data?: Array<{ state_key: string; picker_label: string }> };
      const next = new Map<string, TerminadaInfo>();
      for (const row of json.data ?? []) {
        try { next.set(row.state_key, JSON.parse(row.picker_label) as TerminadaInfo); } catch { /* skip malformed */ }
      }
      setMap(next);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Realtime — mismo patrón que useOdooProgress (canal filtrado por tipo, debounce del reload).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 500);
    };
    const channel = supabase
      .channel(`tienda-terminada-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picking_session_state', filter: `tipo=eq.${TIPO}` }, debounced)
      .subscribe();
    return () => { supabase.removeChannel(channel); if (timer) clearTimeout(timer); };
  }, [load]);

  const marcarTerminada = useCallback(async (cod: string, terminada: boolean, por?: string) => {
    const payload: TerminadaInfo = { terminada, por, at: Date.now() };
    // Optimista: refleja de inmediato en el propio dispositivo; el realtime/poll corrige a los
    // demás. Si el POST falla, la próxima recarga/realtime remoto termina corrigiendo esto también.
    setMap(prev => { const next = new Map(prev); next.set(cod, payload); return next; });
    try {
      await fetch('/api/picking-session-state', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state_key: cod, date: fechaISOLocal(), tipo: TIPO, picker_label: JSON.stringify(payload) }),
      });
    } catch { /* best-effort — ver comentario arriba */ }
  }, []);

  return { terminadas: map, marcarTerminada };
}
