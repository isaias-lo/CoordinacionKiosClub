import { CAL_INICIAL, type CalDia } from '../rutas/data/calendar';

const DAY_CODES = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];

export interface CalendarioCompleto {
  [dia: string]: { rm: string[]; costa: string[]; fal: string[] };
}

let cachedCalendario: CalendarioCompleto | null = null;
let lastFetch: number = 0;
const CACHE_MS = 60000;

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
  if (typeof window === 'undefined') return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key !== CAL_LS_KEY || !e.newValue) return;
    try {
      const { cal } = JSON.parse(e.newValue) as { cal: CalendarioCompleto; ts: number };
      cachedCalendario = cal;
      lastFetch = Date.now();
      cb(cal);
    } catch {}
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
// ───────────────────────────────────────────────────────────────────────────

// Codes that identify Costa (V Región) stores
const COSTA_CODES = new Set(['37VIN','08RNC','33CON','43CUR','54MPQ']);
// Codes that identify Falcón/Región stores
const FAL_CODES = new Set(['46TRE','28TEM','75PUC','53VAL','47PTV','50PTM','39PSB','41ANA','42ANP','31TLC','36CHL','24SPP','38SP2','76PAN','51SER','27MCH']);

// Maps old short ASCII codes → new numeric codes (backward compat with Sheets that still use old codes)
const CODIGO_NUMERICO_MAP: Record<string, string> = {
  // RM
  BNV:'32BNV', BN2:'35BN2', MAI:'17MAI', SCL:'02SCL', LAS:'12LAS',
  EST:'45EST', PQA:'16PQA', CTC:'20CTC', PEN:'23PEÑ', '23PEN':'23PEÑ', SMB:'34SMB',
  LEO:'09LEO', LIL:'40LIL', MQH:'06MQH', LGN:'22LGN', CCR:'07CCR',
  FLO:'18FLO', CFL:'29CFL', LP: '05LP',  TPS:'01TPS', PIE:'13PIE',
  TRQ:'10TRQ', PTA:'49PTA', PHU:'30PHU', NUC:'21NUC', PDG:'04PDG',
  SUB:'19SUB', ILC:'11ILC', BRU:'48BRU', PF: '14PF',  VIT:'03VIT',
  MUT:'52MUT',
  // Costa
  VIN:'37VIN', RNC:'08RNC', CON:'33CON', CUR:'43CUR', MPQ:'54MPQ',
  // Falcón / Región
  PSB:'39PSB', SER:'51SER', MCH:'27MCH', TLC:'31TLC', CHL:'36CHL',
  TRE:'46TRE', SPP:'24SPP', SP2:'38SP2', TEM:'28TEM', PUC:'75PUC',
  PAN:'76PAN', PTV:'47PTV', PTM:'50PTM', ANA:'41ANA', ANP:'42ANP',
  VAL:'53VAL',
};

// Keep export for any code that may reference it directly
export const CODIGO_COMPLETO_REGIONES: Record<string, string> = {
  PSB:'39PSB', SER:'51SER', TEM:'28TEM', TRE:'46TRE', CHL:'36CHL',
  PUC:'75PUC', TLC:'31TLC', SPP:'24SPP', SP2:'38SP2', ANP:'42ANP',
  ANA:'41ANA', MCH:'27MCH', PAN:'76PAN', PTV:'47PTV', PTM:'50PTM',
  VAL:'53VAL',
};

function normalize(s: string): string {
  return s.toUpperCase()
    .replace(/[ÁÉÍÓÚÜ]/g, c => ({ Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ü: 'U' }[c] ?? c));
}

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

  try {
    const res = await fetch('/api/sheets?sheet=CALENDARIO');
    if (!res.ok) throw new Error('API error');
    const data = await res.json();

    const cal: CalendarioCompleto = {
      LU: { rm: [], costa: [], fal: [] },
      MA: { rm: [], costa: [], fal: [] },
      MI: { rm: [], costa: [], fal: [] },
      JU: { rm: [], costa: [], fal: [] },
      VI: { rm: [], costa: [], fal: [] },
      SA: { rm: [], costa: [], fal: [] },
    };

    if (data?.values && Array.isArray(data.values)) {
      let headerRow = -1;
      for (let i = 0; i < data.values.length; i++) {
        if (data.values[i] && data.values[i][0] === 'GRUPO') {
          headerRow = i;
          break;
        }
      }

      if (headerRow >= 0) {
        const diaCols: Record<number, string> = { 2: 'LU', 3: 'MA', 4: 'MI', 5: 'JU', 6: 'VI', 7: 'SA' };

        for (let i = headerRow + 1; i < data.values.length; i++) {
          const row = data.values[i];
          if (!row) continue;

          const col0 = row[0] ? String(row[0]).trim() : '';
          const col1 = row[1] ? String(row[1]).trim().toUpperCase() : '';

          if (col0.includes('📦') || col0.includes('FLOTA') || (col0 === '' && (col1.includes('ARMADO') || col1.includes('TOTAL') || col1.includes('DESTINO')))) {
            continue;
          }

          for (let j = 2; j <= 7; j++) {
            const diaKey = diaCols[j];
            if (!diaKey) continue;

            const tiendasStr = row[j];
            if (!tiendasStr) continue;

            const partes = String(tiendasStr).split(/[\s,;]+/)
              .map(t => normalize(t.trim()))
              .filter(t => t && /^[0-9]{0,2}[A-ZÑ]{2,4}[0-9]?$/.test(t));

            partes.forEach(rawT => {
              // Map old short codes → numeric; numeric codes pass through unchanged
              const t = CODIGO_NUMERICO_MAP[rawT] ?? rawT;
              if (COSTA_CODES.has(t)) {
                cal[diaKey].costa.push(t);
              } else if (FAL_CODES.has(t)) {
                cal[diaKey].fal.push(t);
              } else {
                cal[diaKey].rm.push(t);
              }
            });
          }
        }

        ['LU', 'MA', 'MI', 'JU', 'VI', 'SA'].forEach(dia => {
          cal[dia].rm    = [...new Set(cal[dia].rm)];
          cal[dia].costa = [...new Set(cal[dia].costa)];
          cal[dia].fal   = [...new Set(cal[dia].fal)];
        });
      }
    }

    cachedCalendario = cal;
    lastFetch = Date.now();
    writeLsCache(cal); // persist for cross-tab reads
    return cal;
  } catch (err) {
    console.error('Error fetching calendar:', err);
    return calInicialToCompleto();
  }
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
