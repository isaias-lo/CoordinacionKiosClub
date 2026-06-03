'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Subscribes to INSERT / UPDATE / DELETE on one or more Supabase tables
 * and calls onRefresh() whenever a change is detected.
 *
 * Usage:
 *   useRealtimeRefresh('despacho_rm,despacho_regiones', myRefetchFn);
 *   useRealtimeRefresh('picking_pallets', myRefetchFn, true, 15000, 800);
 *
 * @param tableKey    Comma-separated table name(s), stable between renders.
 * @param onRefresh   Callback invoked on any data change. Keep it stable (useCallback).
 * @param enabled     Pass false to pause the subscription (e.g. while the component is hidden).
 * @param pollMs      Polling fallback interval in ms (default 15 000).
 * @param debounceMs  Debounce realtime events in ms (default 0 = no debounce).
 *                    Useful for tables that receive bursts of writes (e.g. picking_pallets):
 *                    prevents N refetches when a supervisor adds 10 pallets quickly.
 */
export function useRealtimeRefresh(
  tableKey: string,
  onRefresh: () => void,
  enabled = true,
  pollMs = 15000,
  debounceMs = 0,
): void {
  const cbRef    = useRef(onRefresh);
  cbRef.current  = onRefresh;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !tableKey) return;

    const tables = tableKey.split(',').map(t => t.trim()).filter(Boolean);
    if (tables.length === 0) return;

    const fire = () => {
      if (debounceMs > 0) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => cbRef.current(), debounceMs);
      } else {
        cbRef.current();
      }
    };

    const channelId = `rt-${tables.join('-')}-${Math.random().toString(36).slice(2, 7)}`;
    let ch = supabase.channel(channelId);

    for (const table of tables) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, fire);
    }

    ch.subscribe();

    // Polling fallback — fires onRefresh every pollMs even if Realtime drops
    const pollId = setInterval(() => cbRef.current(), pollMs);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(pollId);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey, enabled, pollMs, debounceMs]);
}
