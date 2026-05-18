'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Subscribes to INSERT / UPDATE / DELETE on one or more Supabase tables
 * and calls onRefresh() whenever a change is detected.
 *
 * Usage:
 *   useRealtimeRefresh('despacho_rm,despacho_regiones', myRefetchFn);
 *
 * @param tableKey  Comma-separated table name(s), stable between renders.
 * @param onRefresh Callback invoked on any data change. Keep it stable (useCallback).
 * @param enabled   Pass false to pause the subscription (e.g. while the component is hidden).
 */
export function useRealtimeRefresh(
  tableKey: string,
  onRefresh: () => void,
  enabled = true,
): void {
  // Always-current ref so changing onRefresh never causes re-subscription
  const cbRef = useRef(onRefresh);
  cbRef.current = onRefresh;

  useEffect(() => {
    if (!enabled || !tableKey) return;

    const tables = tableKey.split(',').map(t => t.trim()).filter(Boolean);
    if (tables.length === 0) return;

    const channelId = `rt-${tables.join('-')}-${Math.random().toString(36).slice(2, 7)}`;
    let ch = supabase.channel(channelId);

    for (const table of tables) {
      ch = ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => cbRef.current(),
      );
    }

    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey, enabled]);
}
