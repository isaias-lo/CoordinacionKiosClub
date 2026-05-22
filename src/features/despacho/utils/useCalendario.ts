import { CAL_INICIAL, type CalDia } from '../rutas/data/calendar';
import { fetchCalendarioSupa, subscribeToCalendarioSupa } from '@/lib/calendarioSync';

const DAY_CODES = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];

export interface CalendarioCompleto {
  [dia: string]: { rm: string[]; costa: string[]; fal: string[] };
}

let cachedCalendario: CalendarioCompleto | null = null;
let lastFetch: number = 0;
const CACHE_MS = 60000;

// ── Supabase Realtime singleton (cross-device) ──────────────────────────────
let supaUnsub: (() => void) | null = null;
const supaListeners = new Set<(cal: CalendarioCompleto) => void>();

function ensureSupaListener(): void {
  if (supaUnsub) return;
  supaUnsub = subscribeToCalendarioSupa((cal) => {
    cachedCalendario = cal as CalendarioCompleto;
    lastFetch = Date.now();
    writeLsCache(cal as CalendarioCompleto);
    supaListeners.forEach(fn => fn(cal as CalendarioCompleto));
  });
}
// ───────────────────────────────────────────────────────────────────────────

// ── Cross-tab localStorage cache ────────────────────────────────────────────
export const CAL_LS_KEY = '_calCentral';
const LS_TTL = 60 * 60 * 1000; // 1 hour

function readLsCache(): CalendarioCompleto | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CAL_LS_KEY);
    if (!raw) return null;
    const { cal, ts } = JSON.parse(raw) as { cal: CalendarioCompleto; ts: number };
    if (Date.now() - ts > LS_TTL) return null;
    return cal;
  } catch { return null; }
}

function writeLsCache(cal: CalendarioCompleto): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(CAL_LS_KEY, JSON.stringify({ cal, ts: Date.now() })); } catch {}
}

/**
 * Called by CalendarioColumnas after a successful save.
 * Updates both the in-memory cache and localStorage immediately,
 * which fires a `storage` event in all other open tabs.
 */
export function writeCalendario(cal: CalendarioCompleto): void {
  const copy = JSON.parse(JSON.stringify(cal)) as CalendarioCompleto;
  cachedCalendario = copy;
  lastFetch = Date.now();
  writeLsCache(copy);
}

/**
 * Subscribe to cross-tab calendar updates from CalendarioCentral.
 * Returns an unsubscribe function for use in useEffect cleanup.
 */
export function subscribeToCalendarChanges(cb: (cal: CalendarioCompleto) => void): () => void {
  // localStorage cross-tab (same browser)
  const storageHandler = typeof window !== 'undefined'
    ? (e: StorageEvent) => {
        if (e.key !== CAL_LS_KEY || !e.newValue) return;
        try {
          const { cal } = JSON.parse(e.newValue) as { cal: CalendarioCompleto; ts: number };
          cachedCalendario = cal;
          lastFetch = Date.now();
          cb(cal);
        } catch {}
      }
    : null;
  if (storageHandler) window.addEventListener('storage', storageHandler);

  // Supabase Realtime cross-device
  supaListeners.add(cb);
  ensureSupaListener();

  return () => {
    if (storageHandler) window.removeEventListener('storage', storageHandler);
    supaListeners.delete(cb);
  };
}
// ───────────────────────────────────────────────────────────────────────────

// Keep export for any code that may reference it directly
export const CODIGO_COMPLETO_REGIONES: Record<string, string> = {
  PSB:'39PSB', SER:'51SER', TEM:'28TEM', TRE:'46TRE', CHL:'36CHL',
  PUC:'75PUC', TLC:'31TLC', SPP:'24SPP', SP2:'38SP2', ANP:'42ANP',
  ANA:'41ANA', MCH:'27MCH', PAN:'76PAN', PTV:'47PTV', PTM:'50PTM',
  VAL:'53VAL',
};

function calInicialToCompleto(): CalendarioCompleto {
  const result: CalendarioCompleto = {};
  (Object.entries(CAL_INICIAL) as [string, CalDia][]).forEach(([dia, data]) => {
    result[dia] = {
      rm:    [...data.rm],
      costa: [...data.costa],
      fal:   [...data.fal],
    };
  });
  return result;
}

export async function fetchCalendarioCompleto(): Promise<CalendarioCompleto> {
  // 1. In-memory cache (fastest)
  if (cachedCalendario && Date.now() - lastFetch < CACHE_MS) {
    return cachedCalendario;
  }
  // 2. localStorage cache (cross-tab, survives navigation within same browser)
  const lsCached = readLsCache();
  if (lsCached) {
    cachedCalendario = lsCached;
    lastFetch = Date.now();
    return lsCached;
  }
  // 3. Supabase (cross-device authoritative source) — 3s timeout so it can't block load
  try {
    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 3000));
    const supaCal = await Promise.race([fetchCalendarioSupa(), timeout]);
    if (supaCal) {
      cachedCalendario = supaCal as CalendarioCompleto;
      lastFetch = Date.now();
      writeLsCache(supaCal as CalendarioCompleto);
      return supaCal as CalendarioCompleto;
    }
  } catch { /* fall through to hardcoded default */ }

  // Fallback: hardcoded initial calendar (Supabase is unreachable)
  return calInicialToCompleto();
}

export async function getTiendasDelDia(tipo: 'rm' | 'costa' | 'fal' = 'rm'): Promise<string[]> {
  const cal = await fetchCalendarioCompleto();
  const today = DAY_CODES[new Date().getDay()];
  return cal[today]?.[tipo] || [];
}

export async function getTiendasRegionHoy(): Promise<string[]> {
  const cal = await fetchCalendarioCompleto();
  const today = DAY_CODES[new Date().getDay()];
  return cal[today]?.fal || [];
}

export async function getAllTiendasSantiago(): Promise<string[]> {
  const cal = await fetchCalendarioCompleto();
  const today = DAY_CODES[new Date().getDay()];
  return [...(cal[today]?.rm || []), ...(cal[today]?.costa || []), ...(cal[today]?.fal || [])];
}

export async function refreshCalendario(): Promise<CalendarioCompleto> {
  cachedCalendario = null;
  lastFetch = 0;
  if (typeof window !== 'undefined') {
    try { localStorage.removeItem(CAL_LS_KEY); } catch {}
  }
  return fetchCalendarioCompleto();
}
