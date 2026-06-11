import { supabase } from './supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export type PickingPalletsPayload = RealtimePostgresChangesPayload<Record<string, unknown>>;
type Listener = (payload: PickingPalletsPayload) => void;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let channelUnsub: (() => void) | null = null;
let activeDate = '';
const listeners     = new Set<Listener>();
const reloadListeners = new Set<() => void>(); // called when WebSocket reconnects

function ensureChannel(): void {
  const today = todayISO();
  if (channelUnsub && activeDate === today) return;
  if (channelUnsub) { channelUnsub(); channelUnsub = null; }
  activeDate = today;
  let prevStatus = '';
  const ch = supabase
    .channel(`picking-pallets-${today}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'picking_pallets', filter: `date=eq.${today}` },
      (payload: PickingPalletsPayload) => listeners.forEach(fn => fn(payload)))
    .subscribe((status) => {
      // On reconnect, trigger a full reload so any events missed during the gap are recovered
      if (status === 'SUBSCRIBED' && prevStatus !== '' && prevStatus !== 'SUBSCRIBED') {
        reloadListeners.forEach(fn => fn());
      }
      prevStatus = status;
    });
  channelUnsub = () => { supabase.removeChannel(ch); };
}

/**
 * Singleton channel for picking_pallets changes today.
 * All consumers share one WebSocket subscription instead of each creating their own.
 *
 * @param onPayload   Called with the realtime event payload on each DB change.
 *                    Existing `() => void` callbacks are assignment-compatible (extra arg ignored).
 * @param onReconnect Optional full-reload callback fired when the WebSocket reconnects after
 *                    a disconnect — use to catch events missed during the gap.
 * @returns Unsubscribe function.
 */
export function subscribeToPickingPallets(
  onPayload: Listener,
  onReconnect?: () => void,
): () => void {
  listeners.add(onPayload);
  if (onReconnect) reloadListeners.add(onReconnect);
  ensureChannel();
  return () => {
    listeners.delete(onPayload);
    if (onReconnect) reloadListeners.delete(onReconnect);
    if (listeners.size === 0 && channelUnsub) {
      channelUnsub();
      channelUnsub = null;
      activeDate = '';
    }
  };
}
