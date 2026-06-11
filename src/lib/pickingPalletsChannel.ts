import { supabase } from './supabase';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let channelUnsub: (() => void) | null = null;
let activeDate = '';
const listeners = new Set<() => void>();

function ensureChannel(): void {
  const today = todayISO();
  if (channelUnsub && activeDate === today) return;
  if (channelUnsub) { channelUnsub(); channelUnsub = null; }
  activeDate = today;
  const ch = supabase
    .channel(`picking-pallets-${today}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'picking_pallets', filter: `date=eq.${today}` },
      () => listeners.forEach(fn => fn()))
    .subscribe();
  channelUnsub = () => { supabase.removeChannel(ch); };
}

/**
 * Singleton channel for picking_pallets changes today.
 * All consumers share one WebSocket subscription instead of each creating their own.
 * Returns an unsubscribe function.
 */
export function subscribeToPickingPallets(onUpdate: () => void): () => void {
  listeners.add(onUpdate);
  ensureChannel();
  return () => {
    listeners.delete(onUpdate);
    if (listeners.size === 0 && channelUnsub) {
      channelUnsub();
      channelUnsub = null;
      activeDate = '';
    }
  };
}
