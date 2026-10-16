'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Subscribes to INSERT / UPDATE / DELETE on one or more Supabase tables
 * and calls onRefresh() whenever a change is detected.
 *
 * @param tableKey    Comma-separated "table:filter" or just "table" entries.
 *                    e.g. "picking_pallets:date=eq.2026-06-08,despacho_rm"
 * @param onRefresh   Callback invoked on any data change. Keep it stable (useCallback).
 * @param enabled     Pass false to pause the subscription.
 * @param pollMs      Polling fallback interval in ms (default 15 000). Disconnected: every pollMs. Connected: every max(4×pollMs, 60 s) while visible.
 * @param debounceMs  Debounce realtime events in ms (default 0 = no debounce).
 */
export function useRealtimeRefresh(
  tableKey: string,
  onRefresh: () => void,
  enabled = true,
  pollMs = 15000,
  debounceMs = 0,
): void {
  const cbRef       = useRef(onRefresh);
  cbRef.current     = onRefresh;
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !tableKey) return;

    const entries = tableKey.split(',').map(t => t.trim()).filter(Boolean);
    if (entries.length === 0) return;

    const fire = () => {
      if (debounceMs > 0) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => cbRef.current(), debounceMs);
      } else {
        cbRef.current();
      }
    };

    const channelId = `rt-${entries.join('-')}-${Math.random().toString(36).slice(2, 7)}`;
    let ch = supabase.channel(channelId);

    for (const entry of entries) {
      const colonIdx = entry.indexOf(':');
      const table = colonIdx > 0 ? entry.slice(0, colonIdx) : entry;
      const filter = colonIdx > 0 ? entry.slice(colonIdx + 1) : undefined;
      const opts = filter
        ? { event: '*' as const, schema: 'public' as const, table, filter }
        : { event: '*' as const, schema: 'public' as const, table };
      ch = ch.on('postgres_changes', opts, fire);
    }

    ch.subscribe((status) => {
      const wasConnected = connectedRef.current;
      connectedRef.current = status === 'SUBSCRIBED';
      // Refresh once on reconnect to catch any changes missed during the gap
      if (!wasConnected && connectedRef.current) fire();
    });

    // Polling fallback: cada `pollMs` con el canal caído, y también con el canal «conectado» pero
    // cada 4× (mínimo 1 min) y solo con la pestaña a la vista. Un canal SUBSCRIBED no garantiza
    // que lleguen cambios: si la tabla no está en la publicación de Realtime (así quedó producción
    // tras la migración del 28/09), el canal se conecta y nunca avisa nada, y sin esto la pantalla
    // no se enteraba jamás de lo que hacían los otros equipos.
    const lentoMs = Math.max(pollMs * 4, 60_000);
    let ultimo = Date.now();
    const pollId = setInterval(() => {
      const ahora = Date.now();
      const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
      if (!connectedRef.current || (visible && ahora - ultimo >= lentoMs)) {
        ultimo = ahora;
        cbRef.current();
      }
    }, pollMs);

    return () => {
      connectedRef.current = false;
      supabase.removeChannel(ch);
      clearInterval(pollId);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey, enabled, pollMs, debounceMs]);
}
