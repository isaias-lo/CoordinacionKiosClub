'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import Header         from './components/Header';
import InputSection   from './components/InputSection';
import ResultsSection from './components/ResultsSection';
import ConfigPanel    from './components/ConfigPanel';
import ComparisonView from './components/ComparisonView';
import ParadasAdicionales, { type Parada } from './components/ParadasAdicionales';

import { TIENDAS_INICIAL, GPS_INICIAL, CD_INICIAL } from './data/tiendas';
import { FLOTA_INICIAL } from './data/flota';
import { CAL_INICIAL, DNOM, DCOL } from './data/calendar';
import { getDia, norm, todayStr, fechaTxt } from './utils/helpers';
import { asignar, nn } from './utils/routing';
import type { Ruta, StoreItem } from './utils/routing';
import { fetchAuthenticatedSheet, parseTSheetAuth, parseFSheetAuth, parseCalendarioAuth, guardarDespachoRMFn } from './utils/sheets';
import { fetchCounts, subscribeToSesion } from '../../../lib/despachoSesion';
import { pushSessionState, fetchSessionState, subscribeToSessionState } from '../../../lib/userSessionState';
import type { SesionRow } from '../../../lib/despachoSesion';
import type { TiendaInfo } from './data/tiendas';
import type { Vehiculo } from './data/flota';

type CalRecord = Record<string, { rm: string[]; costa: string[]; fal: string[] }>;
type CalData   = { on: boolean; p: number; b: number; c: number; ch: number; g?: string };

function mergeCalT(
  newCal: CalRecord,
  fechaStr: string,
  prevCalT: Record<string, CalData>,
  activeGrps: Set<string>
): Record<string, CalData> {
  const dia = getDia(fechaStr);
  const calDia = (newCal[dia] || newCal.LU || {}) as Record<string, string[]>;

  // Build map cod → grp for all stores in newCal for this day
  const newStoreMap = new Map<string, string>();
  ['rm', 'costa', 'fal'].forEach(grp => {
    (calDia[grp] || []).forEach(c => {
      if (c && c.length >= 2) newStoreMap.set(c, grp);
    });
  });

  const next: Record<string, CalData> = {};

  // Phase 1: keep prevCalT stores still in newCal — preserves prevCalT insertion order
  Object.keys(prevCalT).forEach(c => {
    const grp = newStoreMap.get(c);
    if (grp !== undefined) {
      next[c] = { ...prevCalT[c], g: grp };
      newStoreMap.delete(c);
    }
  });

  // Phase 2: append brand-new stores from newCal not previously seen
  newStoreMap.forEach((grp, c) => {
    next[c] = { on: activeGrps.has(grp), p: 0, b: 0, c: 0, ch: 0, g: grp };
  });

  // Phase 3: preserve manual / non-empty stores removed from newCal
  Object.keys(prevCalT).forEach(c => {
    if (!next[c] && (prevCalT[c].g === 'manual' || prevCalT[c].p > 0 || prevCalT[c].b > 0)) {
      next[c] = prevCalT[c];
    }
  });

  return next;
}

interface Results {
  ts: StoreItem[];
  rutas: Ruta[];
  extGps?: Record<string, number[]>;
  extTiendas?: Record<string, TiendaInfo & { _parada?: boolean; _tipo?: string; _desc?: string }>;
}

interface ComparisonData {
  manual: Ruta[];
  optima: Ruta[];
  ts: StoreItem[];
  extGps?: Record<string, number[]>;
  extTiendas?: Record<string, TiendaInfo>;
  rebalanceada?: boolean;
}

type PendientesGuardados = { savedAt: string; stores: { c: string; p: number; b: number; ch: number }[] };

export default function RutasScreen() {
  const router = useRouter();
  const { signOut, user } = useAuth();
  const userId = user?.id;

  const [pendientes, setPendientes] = useState<PendientesGuardados | null>(() => {
    try {
      if (typeof window === 'undefined') return null;
      const raw = localStorage.getItem('despacho_pendientes');
      if (!raw) return null;
      const data = JSON.parse(raw) as PendientesGuardados;
      const today = new Date().toISOString().split('T')[0];
      return data.savedAt && data.savedAt !== today && data.stores?.length > 0 ? data : null;
    } catch { return null; }
  });
  const [showPendientesModal, setShowPendientesModal] = useState(false);

  const [tiendas, setTiendas] = useState<Record<string, TiendaInfo>>(() => ({ ...TIENDAS_INICIAL }));
  const [gps,     setGps]     = useState<Record<string, number[]>>(() => ({ ...GPS_INICIAL }));
  const cdRef                 = useRef<number[]>([...CD_INICIAL]);
  const [flota,   setFlota]   = useState<Vehiculo[]>(() => FLOTA_INICIAL.map(v => ({ ...v })));
  const [cal,     setCal]     = useState<CalRecord>(() => {
    // Fast-path: use localStorage cache written by CalendarioCentral (if fresh)
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('_calCentral');
        if (raw) {
          const { cal: cached, ts } = JSON.parse(raw) as { cal: CalRecord; ts: number };
          if (Date.now() - ts < 60 * 60 * 1000) return cached;
        }
      }
    } catch {}
    return JSON.parse(JSON.stringify(CAL_INICIAL));
  });
  const [conductores, setConductores] = useState<string[]>([]);

  const [modo,       setModo]       = useState('cal');
  const [grps,       setGrps]       = useState(new Set(['rm']));
  const [calT,       setCalT]       = useState<Record<string, CalData>>({});
  const [supervisor, setSupervisor] = useState('');
  const [fecha,      setFecha]      = useState(todayStr);
  const [manualText, setManualText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const [results, setResults]           = useState<Results | null>(null);
  const kmTotalRealRef                  = useRef<number | null>(null);
  const [updateStatus,  setUpdateStatus]  = useState('idle');
  const [historialStatus, setHistorialStatus] = useState('idle');
  const [flotaStatus, setFlotaStatus]     = useState('idle');
  const [historialMsg,  setHistorialMsg]  = useState('');

  const [manualAsignaciones, setManualAsignaciones] = useState<Record<string, StoreItem[]>>({});
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);

  const [paradasAdicionales, setParadasAdicionales] = useState<Parada[]>([]);
  const paradaCounter = useRef(0);
  const [paradasOpen, setParadasOpen] = useState(false);
  const [configOpen,  setConfigOpen]  = useState(false);

  const grpsRef = useRef(grps);
  useEffect(() => { grpsRef.current = grps; }, [grps]);

  const fechaRef = useRef(fecha);
  useEffect(() => { fechaRef.current = fecha; }, [fecha]);

  // Chips where the user has manually typed a P/B value — excluded from live sync
  const manuallyEditedRef = useRef<Set<string>>(new Set());

  const sessionRestoredRef = useRef(false);
  const restoringRef       = useRef(false);

  // ── Real-time sync: manualAsignaciones across devices ────────────
  const lastPushedManualRef = useRef<string>('');
  const debounceManualRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualInitRef     = useRef(false);

  // ── Sync cal from CalendarioCentral (cross-tab) ───────────────────
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== '_calCentral' || !e.newValue) return;
      try {
        const { cal: newCal } = JSON.parse(e.newValue) as { cal: CalRecord; ts: number };
        setCal(newCal);
        // Merge new calendar into calT, preserving manually-entered p/b counts
        setCalT(prev => mergeCalT(newCal, fechaRef.current, prev, grpsRef.current));
      } catch {}
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // ── Pre-load from Santiago dispatch ──────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('rutasInput');
      if (raw) {
        const items: StoreItem[] = JSON.parse(raw);
        if (items.length) {
          const newCalT: Record<string, CalData> = {};
          items.forEach(t => {
            newCalT[norm(t.c)] = { on: true, p: t.p, b: t.b, c: 0, ch: (t as { ch?: number }).ch ?? 0, g: 'rm' };
          });
          setCalT(newCalT);
          setGrps(new Set(['rm']));
          localStorage.removeItem('rutasInput');
        }
      }
    } catch (_) {}
  }, []);

  // ── Sync in real-time with Santiago dispatch ───────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncFromSantiago = () => {
      // One-shot: user clicked "Enrutar" in Santiago
      try {
        const raw = localStorage.getItem('rutasInput');
        if (raw) {
          const items: StoreItem[] = JSON.parse(raw);
          if (items.length) {
            const newCalT: Record<string, CalData> = {};
            items.forEach(t => {
              newCalT[norm(t.c)] = { on: true, p: t.p, b: t.b, c: 0, ch: (t as { ch?: number }).ch ?? 0, g: 'rm' };
            });
            setCalT(prev => {
              const merged = { ...prev };
              Object.keys(newCalT).forEach(key => {
                if (!merged[key] || merged[key].p !== newCalT[key].p || merged[key].b !== newCalT[key].b || merged[key].ch !== newCalT[key].ch) {
                  merged[key] = newCalT[key];
                }
              });
              return merged;
            });
            setGrps(new Set(['rm']));
            localStorage.removeItem('rutasInput');
          }
        }
      } catch (_) {}

      // Live: continuous sync from Santiago bodega item registration
      try {
        const rawCounts = localStorage.getItem('santiagoCounts');
        if (rawCounts) {
          const sc: { date?: string; counts?: Record<string, { p: number; b: number; c?: number; ch?: number }> } = JSON.parse(rawCounts);
          const d = new Date();
          const todayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          const counts = (sc.date && sc.date === todayKey)
            ? (sc.counts ?? null)
            : (!sc.date ? null : null); // reject legacy or wrong-date data
          if (counts) {
            setCalT(prev => {
              const merged = { ...prev };
              let changed = false;
              Object.entries(counts).forEach(([cod, data]) => {
                const c = norm(cod);
                const newC  = data.c  ?? 0;
                const newCh = data.ch ?? 0;
                // Skip chips the user has manually edited in this session
                if (merged[c] && !manuallyEditedRef.current.has(c)) {
                  if (merged[c].p !== data.p || merged[c].b !== data.b || merged[c].c !== newC || merged[c].ch !== newCh) {
                    merged[c] = { ...merged[c], p: data.p, b: data.b, c: newC, ch: newCh, on: data.p > 0 || data.b > 0 || newC > 0 || newCh > 0 };
                    changed = true;
                  }
                }
              });
              return changed ? merged : prev;
            });
          }
        }
      } catch (_) {}

      // Live: continuous sync from Regiones bodega item registration
      try {
        const rawRegiones = localStorage.getItem('regionesCounts');
        if (rawRegiones) {
          const rc: { date?: string; counts?: Record<string, { p: number; b: number; c?: number; ch?: number }> } = JSON.parse(rawRegiones);
          const d = new Date();
          const todayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          const counts = (rc.date && rc.date === todayKey) ? (rc.counts ?? null) : null;
          if (counts) {
            setCalT(prev => {
              const merged = { ...prev };
              let changed = false;
              Object.entries(counts).forEach(([cod, data]) => {
                const c = norm(cod);
                const newC  = data.c  ?? 0;
                const newCh = data.ch ?? 0;
                if (manuallyEditedRef.current.has(c)) return;
                if (merged[c]) {
                  if (merged[c].p !== data.p || merged[c].b !== data.b || merged[c].c !== newC || merged[c].ch !== newCh) {
                    merged[c] = { ...merged[c], p: data.p, b: data.b, c: newC, ch: newCh, on: data.p > 0 || data.b > 0 || newC > 0 || newCh > 0 };
                    changed = true;
                  }
                } else if (data.p > 0 || data.b > 0 || newC > 0 || newCh > 0) {
                  merged[c] = { on: true, p: data.p, b: data.b, c: newC, ch: newCh, g: 'fal' };
                  changed = true;
                }
              });
              return changed ? merged : prev;
            });
          }
        }
      } catch (_) {}
    };

    syncFromSantiago();
    window.addEventListener('storage', syncFromSantiago);
    const interval = setInterval(syncFromSantiago, 2000);

    return () => {
      window.removeEventListener('storage', syncFromSantiago);
      clearInterval(interval);
    };
  }, []);

  // ── Supabase Realtime: cross-device sync ───────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const today = todayStr();

    function applyRow(row: SesionRow) {
      setCalT(prev => {
        const c = norm(row.tienda_cod);
        if (manuallyEditedRef.current.has(c)) return prev;
        if (!prev[c]) {
          // Inject stores arriving via Supabase that aren't in the calendar yet
          if ((row.fuente === 'regiones' || row.fuente === 'rm' || row.fuente === 'santiago') && (row.pallets > 0 || row.bultos > 0)) {
            const grp = row.fuente === 'regiones' ? 'fal' : 'rm';
            return { ...prev, [c]: { on: true, p: row.pallets, b: row.bultos, c: row.contenedores ?? 0, ch: 0, g: grp } };
          }
          return prev;
        }
        if (prev[c].p === row.pallets && prev[c].b === row.bultos && prev[c].c === (row.contenedores ?? 0)) return prev;
        return {
          ...prev,
          [c]: { ...prev[c], p: row.pallets, b: row.bultos, c: row.contenedores ?? 0, ch: prev[c].ch ?? 0, on: row.pallets > 0 || row.bultos > 0 || (row.contenedores ?? 0) > 0 },
        };
      });
    }

    // Initial load: fetch any counts already in Supabase (from other devices today)
    const initTimeout = setTimeout(() => {
      fetchCounts(today).then(rows => rows.forEach(applyRow)).catch(() => {});
    }, 1500);

    // Subscribe to real-time changes from other devices
    const unsub = subscribeToSesion(today, applyRow);

    return () => {
      clearTimeout(initTimeout);
      unsub();
    };
  }, []);

  // ── One-time restore: merge saved despachoCounts into calT ────────
  // Only restores if the saved payload was written for the same fecha;
  // stale data from a previous day is silently discarded.
  useEffect(() => {
    if (sessionRestoredRef.current || Object.keys(calT).length === 0) return;
    sessionRestoredRef.current = true;
    try {
      const saved = localStorage.getItem('despachoCounts');
      if (!saved) return;
      const payload: { date?: string; counts?: Record<string, { p: number; b: number; c?: number }> } = JSON.parse(saved);
      const savedDate = payload.date;
      const session   = payload.counts ?? (payload as Record<string, { p: number; b: number; c?: number }>);
      // Reject if no date stamp (legacy) or if date doesn't match current session
      if (!savedDate || savedDate !== fecha) return;
      const entries = Object.entries(session).filter(([, d]) => d.p > 0 || d.b > 0 || (d.c ?? 0) > 0);
      if (!entries.length) return;
      restoringRef.current = true;
      setCalT(prev => {
        const merged = { ...prev };
        entries.forEach(([cod, data]) => {
          const c = norm(cod);
          // Only restore counts for stores already in today's calendar — never inject
          // stores from a different day's session into the current day's view.
          if (merged[c]) merged[c] = { ...merged[c], p: data.p, b: data.b, c: data.c ?? 0, ch: (data as { ch?: number }).ch ?? 0, on: true };
        });
        return merged;
      });
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calT]);

  // ── Write despachoCounts → Santiago bodega ────────────────────────
  // Skipped during the restore cycle so we never overwrite the saved session
  // with the transient all-zero calendar state that exists before restore applies.
  useEffect(() => {
    if (typeof window === 'undefined' || !sessionRestoredRef.current) return;
    if (restoringRef.current) { restoringRef.current = false; return; }
    const counts: Record<string, { p: number; b: number; c: number }> = {};
    Object.entries(calT).forEach(([cod, data]) => {
      if (data.p > 0 || data.b > 0 || data.c > 0) counts[cod] = { p: data.p, b: data.b, c: data.c };
    });
    localStorage.setItem('despachoCounts', JSON.stringify({ date: fecha, counts }));
  }, [calT, fecha]);

  // ── Load fleet from Supabase (source of truth) ───────────────────
  useEffect(() => {
    fetch('/api/flota')
      .then(r => r.ok ? r.json() : null)
      .then((json: { flota: Vehiculo[] } | null) => {
        if (json?.flota && json.flota.length > 0) {
          setFlota(json.flota);
        } else if (json?.flota && json.flota.length === 0) {
          // Table is empty — seed it with FLOTA_INICIAL
          FLOTA_INICIAL.forEach(v => {
            fetch('/api/flota', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify(v),
            }).catch(() => {});
          });
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load conductores catalog from Supabase ───────────────────────
  useEffect(() => {
    fetch('/api/conductores')
      .then(r => r.ok ? r.json() : null)
      .then((json: { conductores: { nombre: string }[] } | null) => {
        if (json?.conductores?.length) {
          setConductores(json.conductores.map(c => c.nombre));
        }
      })
      .catch(() => {});
  }, []);

  // ── Load sheets data ──────────────────────────────────────────────
  useEffect(() => { handleActualizarDatos(); }, []);

  // ── Sync manual assignments when calT changes ────────────────────
  useEffect(() => {
    setManualAsignaciones(prev => {
      let changed = false;
      const next = { ...prev };
      Object.keys(next).forEach(plate => {
        next[plate] = next[plate].map(s => {
          const updated = calT[s.c];
          if (updated && (updated.p !== s.p || updated.b !== s.b)) {
            changed = true;
            return { ...s, p: updated.p, b: updated.b };
          }
          return s;
        });
      });
      return changed ? next : prev;
    });
  }, [calT]);

  // ── Fetch + subscribe manualAsignaciones (cross-device) ──────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    fetchSessionState('rutas').then(remote => {
      if (remote && typeof remote === 'object') {
        const remoteJson = JSON.stringify(remote);
        setManualAsignaciones(remote as Record<string, StoreItem[]>);
        lastPushedManualRef.current = remoteJson;
      }
      isManualInitRef.current = true;
    }).catch(() => { isManualInitRef.current = true; });

    const unsub = subscribeToSessionState('rutas', userId ?? '', (state) => {
      if (!state || typeof state !== 'object') return;
      const remoteJson = JSON.stringify(state);
      if (remoteJson === lastPushedManualRef.current) return;
      lastPushedManualRef.current = remoteJson;
      setManualAsignaciones(state as Record<string, StoreItem[]>);
    });

    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Debounced push manualAsignaciones → Supabase ─────────────────
  useEffect(() => {
    if (!isManualInitRef.current) return;
    const json = JSON.stringify(manualAsignaciones);
    if (json === lastPushedManualRef.current) return;
    if (debounceManualRef.current) clearTimeout(debounceManualRef.current);
    debounceManualRef.current = setTimeout(() => {
      lastPushedManualRef.current = json;
      pushSessionState('rutas', manualAsignaciones, userId).catch(() => {});
    }, 800);
    return () => {
      if (debounceManualRef.current) clearTimeout(debounceManualRef.current);
    };
  }, [manualAsignaciones, userId]);

  // ── Sync manual text → calT ───────────────────────────────────────
  useEffect(() => {
    if (modo !== 'man') return;
    const txt = manualText.trim();
    if (!txt) return;
    const result = parseManual(txt);
    if (result.ts.length === 0) return;
    setCalT(prev => {
      const next = { ...prev };
      let changed = false;
      result.ts.forEach(t => {
        if (!next[t.c]) { next[t.c] = { on: true, p: t.p, b: t.b, c: 0, ch: 0, g: 'manual' }; changed = true; }
        else if (next[t.c].p !== t.p || next[t.c].b !== t.b) { next[t.c] = { ...next[t.c], on: true, p: t.p, b: t.b }; changed = true; }
      });
      return changed ? next : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualText, modo]);

  // ── Init calT from calendar when empty ───────────────────────────
  useEffect(() => {
    if (Object.keys(calT).length > 0) return;
    const dia    = getDia(fecha);
    const calDia = cal[dia] || cal.LU || {};
    const newCalT: Record<string, CalData> = {};
    ['rm','costa','fal'].forEach(grp => {
      ((calDia as Record<string, string[]>)[grp] || []).forEach(c => {
        if (c && c.length >= 2) newCalT[c] = { on: grpsRef.current.has(grp), p: 0, b: 0, c: 0, ch: 0, g: grp };
      });
    });
    setCalT(newCalT);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, cal]);

  // ── Sorted calT — preserves CALENDARIO group order (rm → costa → fal) ──
  const sortedCalT = useMemo(() => {
    const dia    = getDia(fecha);
    const calDia = cal[dia] || cal.LU || {};
    // Orden igual al Calendario de Despacho: Regiones → Costa → RM
    const canonical: string[] = [
      ...((calDia as Record<string, string[]>).fal   || []),
      ...((calDia as Record<string, string[]>).costa || []),
      ...((calDia as Record<string, string[]>).rm    || []),
    ];
    const result: Record<string, CalData> = {};
    canonical.forEach(c => { if (calT[c]) result[c] = calT[c]; });
    const groupOrder: Record<string, number> = { fal: 0, costa: 1, rm: 2 };
    const extras = Object.keys(calT)
      .filter(c => !result[c])
      .sort((a, b) => (groupOrder[calT[a].g || 'fal'] ?? 0) - (groupOrder[calT[b].g || 'fal'] ?? 0));
    extras.forEach(c => { result[c] = calT[c]; });
    return result;
  }, [calT, cal, fecha]);

  // ── Sync calT → manual text ───────────────────────────────────────
  // La generación del texto (con tabs RM/COSTA/REGIONES, CH y totales)
  // ahora vive en ManualMode, que recibe sortedCalT como prop.

  // ── Calendar handlers ─────────────────────────────────────────────
  function handleToggleGroup(gid: string) {
    setGrps(prev => {
      const next = new Set(prev);
      next.has(gid) ? next.delete(gid) : next.add(gid);
      setCalT(prevCalT => {
        const c2 = { ...prevCalT };
        Object.keys(c2).forEach(c => { if (c2[c].g === gid) c2[c] = { ...c2[c], on: next.has(gid) }; });
        return c2;
      });
      return next;
    });
  }

  function handleToggleChip(cod: string) {
    setCalT(prev => ({ ...prev, [cod]: { ...prev[cod], on: !prev[cod].on } }));
  }

  function handleUpdateChip(cod: string, key: 'p' | 'b' | 'c' | 'ch', val: string) {
    manuallyEditedRef.current.add(cod);
    const v = parseInt(val) || 0;
    setCalT(prev => ({
      ...prev,
      [cod]: key === 'b'
        ? { ...prev[cod], b: v, ch: 0, on: v > 0 ? true : prev[cod].on }
        : { ...prev[cod], [key]: v, on: v > 0 ? true : prev[cod].on },
    }));
  }

  // ── Fleet handlers ────────────────────────────────────────────────
  function handleToggleFlota(idx: number) {
    setFlota(prev => prev.map((v, i) => i === idx ? { ...v, on: !v.on } : v));
  }
  function handleToggleTlbd(idx: number) {
    setFlota(prev => prev.map((v, i) => i === idx ? { ...v, tlbd: !v.tlbd } : v));
  }
  function handleConductorChange(idx: number, nombre: string) {
    setFlota(prev => prev.map((v, i) => i === idx ? { ...v, ch: nombre } : v));
  }
  function handleAgregarConductor(nombre: string) {
    const n = nombre.trim();
    if (!n) return;
    setConductores(prev => prev.includes(n) ? prev : [...prev, n]);
    fetch('/api/conductores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: n }),
    }).catch(() => {});
  }
  function handleAgregarVehiculo(vehiculo: Vehiculo) {
    setFlota(prev => [...prev, vehiculo]);
    setFlotaStatus('saving');
    // Persist to Supabase + sync to Sheets
    fetch('/api/flota', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(vehiculo),
    }).then(async r => {
      if (r.status === 409) {
        // Already exists — update instead
        await fetch('/api/flota', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(vehiculo),
        });
      } else if (!r.ok) {
        throw new Error(`Error ${r.status}`);
      }
      // Sync fleet to Google Sheets
      return fetch('/api/flota/export-sheets', { method: 'POST' });
    }).then(r => {
      if (r && !r.ok) throw new Error('Error sincronizando Sheets');
      setFlotaStatus('success');
      setTimeout(() => setFlotaStatus('idle'), 3000);
    }).catch(e => {
      console.error('[handleAgregarVehiculo]', e);
      setFlotaStatus('error');
      setTimeout(() => setFlotaStatus('idle'), 4000);
    });
  }
  function handleEliminarVehiculo(idx: number) {
    setFlota(prev => {
      const vehiculoEliminado = prev[idx];
      const newFlota = prev.filter((_, i) => i !== idx);
      if (vehiculoEliminado?.p) {
        setFlotaStatus('saving');
        fetch(`/api/flota?patente=${encodeURIComponent(vehiculoEliminado.p)}`, { method: 'DELETE' })
          .then(r => { if (!r.ok) throw new Error(`Error ${r.status}`); return fetch('/api/flota/export-sheets', { method: 'POST' }); })
          .then(r => { if (r && !r.ok) throw new Error('Error sincronizando Sheets'); setFlotaStatus('success'); setTimeout(() => setFlotaStatus('idle'), 3000); })
          .catch(e => { console.error('[handleEliminarVehiculo]', e); setFlotaStatus('error'); setTimeout(() => setFlotaStatus('idle'), 4000); });
      }
      return newFlota;
    });
  }
  const handleActualizarVehiculoRef = useRef<((v: Partial<Vehiculo> & { p: string }) => void) | null>(null);
  handleActualizarVehiculoRef.current = function handleActualizarVehiculo(vehiculo: Partial<Vehiculo> & { p: string }) {
    setFlotaStatus('saving');
    setFlota(prev => prev.map(v => v.p === vehiculo.p ? { ...v, ...vehiculo } : v));
    fetch('/api/flota', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(vehiculo),
    }).then(r => { if (!r.ok) throw new Error(`Error ${r.status}`); return fetch('/api/flota/export-sheets', { method: 'POST' }); })
      .then(() => { setFlotaStatus('success'); setTimeout(() => setFlotaStatus('idle'), 3000); })
      .catch(e => { console.error('[handleActualizarVehiculo]', e); setFlotaStatus('error'); setTimeout(() => setFlotaStatus('idle'), 4000); });
  };
  function handleActualizarVehiculo(patente: string, updates: Partial<Vehiculo>) {
    handleActualizarVehiculoRef.current?.({ p: patente, ...updates });
  }

  // ── Manual text parser ────────────────────────────────────────────
  function parseManual(txt: string): { ts: StoreItem[]; errs: string[] } {
    const ts: StoreItem[] = [], errs: string[] = [];
    txt = txt.replace(/[⁠​‌‍﻿   ]/g, '');
    txt.split('\n').forEach((ln, i) => {
      const raw = ln.trim(); if (!raw) return;
      const m = raw.match(/^([A-Za-záéíóúÁÉÍÓÚñÑ0-9]+)\s*:?\s*(\d+)\s*[Pp]\s*(?:[+\-]?\s*(\d+)\s*[Bb])?/);
      if (m) {
        const c = norm(m[1]);
        if (!tiendas[c]) { errs.push(`"${m[1]}" no reconocido (línea ${i+1})`); return; }
        ts.push({ c, p: parseInt(m[2]), b: parseInt(m[3] || '0') });
      } else {
        errs.push(`Línea ${i+1}: "${raw}" — formato incorrecto`);
      }
    });
    return { ts, errs };
  }

  // ── Extra stops helpers ───────────────────────────────────────────
  function buildExtendidos(baseGps: Record<string, number[]>, baseTiendas: Record<string, TiendaInfo>) {
    const extGps     = { ...baseGps };
    const extTiendas: Record<string, TiendaInfo & { _parada?: boolean; _tipo?: string; _desc?: string }> = { ...baseTiendas };
    paradasAdicionales.filter(p => p.gps).forEach(p => {
      extGps[p.id] = p.gps;
      extTiendas[p.id] = { n: p.direccion, z: p.tipo === 'entrega' ? 'Entrega' : 'Retiro', v: '', _parada: true, _tipo: p.tipo, _desc: p.descripcion };
    });
    return { extGps, extTiendas };
  }

  // ── Calculate routes ──────────────────────────────────────────────
  function handleCalcular() {
    let ts: StoreItem[] = [], errs: string[] = [];

    if (modo === 'cal') {
      Object.keys(calT).forEach(c => {
        const t = calT[c];
        if (!t.on) return;
        if (!t.p && !t.b) { errs.push(`"${c}" sin pallets ni bultos`); return; }
        ts.push({ c, p: t.p, b: t.b });
      });
    } else {
      const tx = manualText.trim();
      if (!tx) { setErrors(['Ingresa al menos una tienda.']); return; }
      const r = parseManual(tx);
      ts = r.ts; errs = [...errs, ...r.errs];
    }

    if (errs.length) setErrors(errs); else setErrors([]);
    if (!ts.length) { setErrors(prev => [...prev, 'No hay tiendas válidas.']); return; }

    const { extGps, extTiendas } = buildExtendidos(gps, tiendas);
    paradasAdicionales.filter(p => p.gps).forEach(p => ts.push({ c: p.id, p: p.p, b: p.b }));

    const rutas = asignar(ts, flota, extGps, cdRef.current, null, null, null, extTiendas);
    setResults({ ts, rutas, extGps, extTiendas });
    kmTotalRealRef.current = null;

    // Guardar tiendas sin asignar en localStorage para segunda vuelta
    try {
      const asignadas = new Set(rutas.flatMap(r => r.ts.map(t => t.c)));
      const noAsignadas = ts.filter(t => !asignadas.has(t.c) && !t.c.startsWith('_P'));
      if (noAsignadas.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        localStorage.setItem('despacho_pendientes', JSON.stringify({
          savedAt: today,
          stores: noAsignadas.map(t => ({ c: t.c, p: t.p, b: t.b, ch: (calT[t.c]?.ch ?? 0) })),
        }));
      }
    } catch {}
  }

  // ── Calculate manual routes ───────────────────────────────────────
  function handleCalcularManual() {
    const { extGps, extTiendas } = buildExtendidos(gps, tiendas);

    const tiendasActivas = Object.keys(calT)
      .filter(c => calT[c].on && (calT[c].p > 0 || calT[c].b > 0))
      .map(c => ({ c, p: calT[c].p, b: calT[c].b }));

    const paradasItems = paradasAdicionales.filter(p => p.gps).map(p => ({ c: p.id, p: p.p, b: p.b }));
    const allItems     = [...tiendasActivas, ...paradasItems];

    const manualRutas = flota
      .filter(v => v.on)
      .map(v => {
        const stores = (manualAsignaciones[v.p] || []).map(s => ({
          ...s, _v: (extTiendas as Record<string, TiendaInfo & {v?:string}>)[s.c]?.v || '',
        }));
        if (!stores.length) return null;
        const ordered = stores.length > 1 ? nn(stores, extGps, cdRef.current) : stores;
        const tp = ordered.reduce((s, t) => s + t.p, 0);
        const tb = ordered.reduce((s, t) => s + t.b + ((t as { ch?: number }).ch ?? 0), 0);
        return { v, ts: ordered, tp, tb };
      })
      .filter((r): r is Ruta => r !== null);

    const rebalanceadas = rebalanceIfOver(manualRutas, extGps, extTiendas);
    const optimaRutas   = asignar(allItems, flota, extGps, cdRef.current, null, null, null, extTiendas);
    setComparisonData({ manual: rebalanceadas, optima: optimaRutas, ts: allItems, extGps, extTiendas, rebalanceada: rebalanceadas !== manualRutas });
  }

  function rebalanceIfOver(manualRutas: Ruta[], gpsMap: Record<string, number[]>, tiendasData: Record<string, TiendaInfo>): Ruta[] {
    const over = manualRutas.filter(r => r.tp > r.v.c);
    if (!over.length) return manualRutas;

    const result = manualRutas.map(r => ({ ...r, ts: [...r.ts] }));
    const disp   = flota.filter(v => v.on);

    over.forEach(ruta => {
      const excedente = ruta.ts.filter(t => t.p > ruta.v.c);
      excedente.forEach(t => {
        ruta.ts = ruta.ts.filter(x => x.c !== t.c);
        ruta.tp -= t.p; ruta.tb -= t.b;
      });

      const capRestante = ruta.v.c - ruta.tp;
      if (capRestante > 0) {
        ruta.ts = ruta.ts.filter(x => x.p <= capRestante);
        ruta.tp = ruta.ts.reduce((s, x) => s + x.p, 0);
        ruta.tb = ruta.ts.reduce((s, x) => s + x.b, 0);
      }

      excedente.forEach(x => {
        const cands = disp
          .filter(v => v.p !== ruta.v.p && v.c >= x.p)
          .map(v => ({ v, usedP: (result.find(r2 => r2.v.p === v.p)?.tp) || 0 }))
          .filter(c => c.usedP + x.p <= c.v.c)
          .sort((a, b) => (a.usedP / a.v.c) - (b.usedP / b.v.c));

        if (cands.length) {
          const dest    = result.find(r2 => r2.v.p === cands[0].v.p)!;
          const enriched: StoreItem = { ...x, _v: tiendasData[x.c]?.v || '' };
          if (dest.ts.length > 1) dest.ts = nn([...dest.ts, enriched], gpsMap, cdRef.current);
          else dest.ts.push(enriched);
          dest.tp += x.p; dest.tb += x.b + ((x as { ch?: number }).ch ?? 0);
        }
      });
    });

    return result.filter(r => r.ts.length > 0);
  }

  // ── Extra stops ───────────────────────────────────────────────────
  function handleOpenParadas()  { setParadasOpen(true);  document.body.style.overflow = 'hidden'; }
  function handleCloseParadas() { setParadasOpen(false); document.body.style.overflow = ''; }
  function handleAgregarParada(parada: Omit<Parada, 'id'>) {
    paradaCounter.current++;
    setParadasAdicionales(prev => [...prev, { ...parada, id: `_P${paradaCounter.current}` }]);
  }
  function handleEliminarParada(id: string) {
    setParadasAdicionales(prev => prev.filter(p => p.id !== id));
    setManualAsignaciones(prev => {
      const next: Record<string, StoreItem[]> = {};
      Object.keys(prev).forEach(plate => { next[plate] = prev[plate].filter(s => s.c !== id); });
      return next;
    });
  }
  function handleUsarRuta(rutas: Ruta[], ts: StoreItem[]) {
    setResults({
      ts, rutas,
      extGps:     comparisonData?.extGps,
      extTiendas: comparisonData?.extTiendas,
    });
    setComparisonData(null);
    kmTotalRealRef.current = null;
  }
  function handleVolverEditar() { setComparisonData(null); }

  // ── Clean ─────────────────────────────────────────────────────────
  function handleLimpiar() {
    manuallyEditedRef.current.clear();
    setResults(null); setErrors([]); setManualText(''); setManualAsignaciones({});
    setComparisonData(null); setParadasAdicionales([]); kmTotalRealRef.current = null;
    setHistorialMsg(''); setHistorialStatus('idle');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Volver a edición (keeps paradas and calT) ──────────────────────
  function handleVolverAEdicion() {
    setResults(null); setComparisonData(null);
    setHistorialMsg(''); setHistorialStatus('idle');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── PDF ───────────────────────────────────────────────────────────
  function handleGenerarPDF() { setTimeout(() => window.print(), 100); }

  // ── Update from Sheets (Authenticated) ───────────────────────────
  async function handleActualizarDatos() {
    setUpdateStatus('loading');
    try {
      const [t1, t2, t3] = await Promise.all([
        fetchAuthenticatedSheet('TIENDAS'),
        fetchAuthenticatedSheet('FLOTA'),
        fetchAuthenticatedSheet('CALENDARIO'),
      ]);
      const newTiendas = { ...tiendas };
      const newGps     = { ...gps };
      const newFlota   = flota.map(v => ({ ...v }));
      if (t1?.values) parseTSheetAuth(t1.values, newTiendas, newGps);
      if (t2?.values) parseFSheetAuth(t2.values, newFlota);
      if (t3?.values) {
        const sheetsCal = parseCalendarioAuth(t3.values);
        if (sheetsCal) {
          // Re-order Sheets data to match CalendarioCentral order from localStorage
          let newCal = sheetsCal;
          try {
            if (typeof window !== 'undefined') {
              const lsRaw = localStorage.getItem('_calCentral');
              if (lsRaw) {
                const { cal: lsCal } = JSON.parse(lsRaw) as { cal: CalRecord; ts: number };
                const ordered: CalRecord = {};
                ['LU','MA','MI','JU','VI','SA'].forEach(dia => {
                  ordered[dia] = { rm: [], costa: [], fal: [] };
                  (['rm','costa','fal'] as const).forEach(grp => {
                    const sheetsSet = new Set(sheetsCal[dia]?.[grp] || []);
                    // First: stores in CalendarioCentral order (if also in Sheets)
                    (lsCal[dia]?.[grp] || []).forEach(c => {
                      if (sheetsSet.has(c)) { ordered[dia][grp].push(c); sheetsSet.delete(c); }
                    });
                    // Then: any remaining in Sheets not yet in CalendarioCentral
                    sheetsSet.forEach(c => ordered[dia][grp].push(c));
                  });
                });
                newCal = ordered;
              }
            }
          } catch {}
          setCal(newCal);
          setCalT(prev => mergeCalT(newCal, fecha, prev, grpsRef.current));
        }
      }
      setTiendas(newTiendas); setGps(newGps); setFlota(newFlota);
      setUpdateStatus('success');
      setTimeout(() => setUpdateStatus('idle'), 3000);
    } catch (e) {
      console.error('Error actualizando:', e);
      setUpdateStatus('error');
      setTimeout(() => setUpdateStatus('idle'), 4000);
    }
  }

  // ── Save fleet ────────────────────────────────────────────────────
  function handleGuardarFlota() {
    setFlotaStatus('saving');
    fetch('/api/flota/export-sheets', { method: 'POST' })
      .then(r => { if (!r.ok) throw new Error('Error sincronizando Sheets'); setFlotaStatus('success'); setTimeout(() => setFlotaStatus('idle'), 3000); })
      .catch(e => { console.error('[handleGuardarFlota]', e); setFlotaStatus('error'); setTimeout(() => setFlotaStatus('idle'), 4000); });
  }

  // ── Save history ──────────────────────────────────────────────────
  async function handleGuardarHistorial() {
    if (!results) { setHistorialStatus('warn'); setHistorialMsg('⚠️ No hay rutas calculadas.'); return; }
    setHistorialStatus('loading');
    setHistorialMsg('');

    const totalPallets = results.rutas.reduce((acc, r) => acc + r.ts.reduce((a, t) => a + t.p, 0), 0);
    const totalBultos  = results.rutas.reduce((acc, r) => acc + r.ts.reduce((a, t) => a + t.b + ((t as { ch?: number }).ch ?? 0), 0), 0);
    const totalTiendas = new Set(results.rutas.flatMap(r => r.ts.map(t => t.c))).size;
    const totalRutas   = results.rutas.length;
    const kmTotal      = Math.round((results.rutas.reduce((acc, r) => acc + (r._kmReal ?? 0), 0)) * 10) / 10;

    // 1. PRIMARY: guardar en Supabase — de aquí viene el feedback al usuario
    try {
      const res = await fetch('/api/historial-despacho', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha, supervisor, totalTiendas, totalPallets, totalBultos, totalRutas, kmTotal,
          resumen: results.rutas.map(r => ({
            patente:   r.v.p,
            conductor: r._choferAsignado || r.v.ch,
            tiendas:   r.ts.map(t => t.c),
            pallets:   r.tp,
            bultos:    r.tb,
          })),
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);

      setHistorialMsg(`✓ Guardado · ${fecha} · ${totalTiendas} tiendas · ${totalPallets}P+${totalBultos}B · ${kmTotal}km`);
      setHistorialStatus('success');
      try { localStorage.removeItem('despacho_pendientes'); } catch {}
      setPendientes(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setHistorialMsg(`⚠️ Error guardando: ${msg}`);
      setHistorialStatus('error');
      return; // No continuar con las sincronizaciones secundarias si Supabase falló
    }

    // 2. SECONDARY (fire-and-forget): actualiza conductor/ruta en despacho_rm y picking_pallets
    const routingUpdates = results.rutas.flatMap((ruta, ri) => {
      const conductor = ruta._choferAsignado || ruta.v.ch || '';
      const patente   = ruta.v.p;
      const empresa   = ruta.v.empresa || 'Luis Fica';
      const rutaNum   = String(ri + 1);
      return ruta.ts.map(ts => ({ cod: ts.c, conductor, patente, transporte: empresa, ruta: rutaNum, supervisor }));
    });
    if (routingUpdates.length > 0) {
      fetch('/api/despacho-records', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fecha, updates: routingUpdates }),
      }).catch(e => console.error('[despacho-records PATCH]', e));
    }

    // 3. SECONDARY (fire-and-forget): sincroniza DESPACHO RM en Google Sheets
    guardarDespachoRMFn({ fecha, supervisor, rutas: results.rutas, tiendas });

    // 4. SECONDARY (fire-and-forget): escribe en HISTORIAL de Google Sheets directamente
    const fechaDDMM = fecha.split('-').reverse().join('/'); // YYYY-MM-DD → DD/MM/YYYY
    const fechaLeg  = fechaTxt(fecha);
    const historialRows: (string | number)[][] = results.rutas.map((r, ri) => [
      fechaDDMM,
      fechaLeg,
      supervisor,
      r.v.p,
      r._choferAsignado || r.v.ch || '',
      r.v.tlbd ? '2' : '1',
      r.ts.length,
      r.tp,
      r.tb,
      r._kmReal ?? 0,
      r.ts.map(t => t.c).join(', '),
      String(ri + 1),
    ]);
    fetch('/api/sheets-write', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ sheet: 'HISTORIAL', rows: historialRows }),
    }).catch(e => console.error('[historial-sheets]', e));
  }

  // ── Driver change ─────────────────────────────────────────────────
  function handleChoferChange(ri: number, nombre: string) {
    if (!results) return;
    setResults({ ...results, rutas: results.rutas.map((r, i) => i === ri ? { ...r, _choferAsignado: nombre } : r) });
  }

  // ── Config ────────────────────────────────────────────────────────
  function handleOpenConfig()  { setConfigOpen(true);  document.body.style.overflow = 'hidden'; }
  function handleCloseConfig() { setConfigOpen(false); document.body.style.overflow = ''; }
  function handleSaveConfig(newCal: CalRecord) {
    setCal(newCal);
    setCalT(prev => mergeCalT(newCal, fecha, prev, grpsRef.current));
    setConfigOpen(false);
    document.body.style.overflow = '';
  }

  return (
    <div className="despacho-inner h-full flex flex-col overflow-hidden bg-kbg font-sans text-ktext">
      <Header
        updateStatus={updateStatus}
        tiendas={tiendas}
        onUpdate={handleActualizarDatos}
        onOpenConfig={handleOpenConfig}
        onBack={() => {
          const from = sessionStorage.getItem('despacho_from');
          sessionStorage.removeItem('despacho_from');
          router.push(from || '/despacho/santiago');
        }}
        onSignOut={async () => { await signOut(); router.push('/login'); }}
      />

      {/* Pill de pendientes del día anterior */}
      {pendientes && pendientes.stores.length > 0 && (
        <div className="flex-shrink-0 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 flex">
          <button
            onClick={() => setShowPendientesModal(true)}
            className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-700 border border-amber-500/40 hover:bg-amber-500/30 transition-all active:scale-95"
          >
            📦 Tiendas pendientes de ayer ({pendientes.stores.length})
          </button>
        </div>
      )}

      {/* Modal de pendientes */}
      {showPendientesModal && pendientes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowPendientesModal(false); }}
        >
          <div className="bg-[#1a1a1a] border border-amber-500/30 rounded-2xl w-full max-w-md mx-4 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-amber-500/20 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-amber-300">Tiendas pendientes</div>
                <div className="text-xs text-amber-500/70 mt-0.5">{pendientes.savedAt}</div>
              </div>
              <button
                onClick={() => setShowPendientesModal(false)}
                className="text-white/40 hover:text-white/80 text-lg leading-none transition-colors"
              >
                ×
              </button>
            </div>

            {/* Lista de tiendas */}
            <div className="px-5 py-4 max-h-64 overflow-y-auto space-y-2">
              {pendientes.stores.map(s => (
                <div key={s.c} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                  <span className="font-mono text-sm font-bold text-white">{s.c}</span>
                  <div className="flex gap-2 text-xs text-white/60">
                    {s.p > 0 && <span>{s.p}P</span>}
                    {s.b > 0 && <span>{s.b}B</span>}
                    {s.ch > 0 && <span>{s.ch}CH</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Acciones */}
            <div className="px-5 py-4 border-t border-white/10 flex gap-3">
              <button
                onClick={() => {
                  setCalT(prev => {
                    const next = { ...prev };
                    pendientes.stores.forEach(s => {
                      if (!next[s.c]) {
                        next[s.c] = { on: true, p: s.p, b: s.b, c: 0, ch: s.ch ?? 0, g: 'pendiente' };
                      } else {
                        next[s.c] = { ...next[s.c], on: true, p: s.p, b: s.b, ch: s.ch ?? 0, g: 'pendiente' };
                      }
                    });
                    return next;
                  });
                  localStorage.removeItem('despacho_pendientes');
                  setPendientes(null);
                  setShowPendientesModal(false);
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-400 active:scale-95 transition-all"
              >
                ✅ Incluir en esta sesión
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem('despacho_pendientes');
                  setPendientes(null);
                  setShowPendientesModal(false);
                }}
                className="py-2.5 px-4 rounded-xl text-sm font-semibold bg-white/10 text-white/70 hover:bg-white/20 active:scale-95 transition-all"
              >
                🗑 Descartar
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-hidden">
        <InputSection
          flota={flota} conductores={conductores}
          modo={modo} grps={grps} calT={sortedCalT}
          supervisor={supervisor} fecha={fecha}
          manualText={manualText} errors={errors}
          dnom={DNOM}
          tiendas={tiendas} gps={gps} cd={cdRef.current}
          manualAsignaciones={manualAsignaciones}
          paradasAdicionales={paradasAdicionales}
          onOpenParadas={handleOpenParadas}
          onModo={m => setModo(m)}
          onToggleGroup={handleToggleGroup}
          onToggleChip={handleToggleChip}
          onUpdateChip={handleUpdateChip}
          flotaStatus={flotaStatus}
          onConductorChange={handleConductorChange}
          onAgregarConductor={handleAgregarConductor}
          onToggleFlota={handleToggleFlota}
          onToggleTlbd={handleToggleTlbd}
          onAgregarVehiculo={handleAgregarVehiculo}
          onEliminarVehiculo={handleEliminarVehiculo}
          onActualizarVehiculo={handleActualizarVehiculo}
          onGuardarFlota={handleGuardarFlota}
          onSupervisor={setSupervisor}
          onFecha={setFecha}
          onManual={setManualText}
          onAsignaciones={setManualAsignaciones}
          onCalcular={handleCalcular}
          onCalcularManual={handleCalcularManual}
          onLimpiar={handleLimpiar}
          onEliminarParada={handleEliminarParada}
          rightPanelContent={
            results ? (
              <div className="h-full overflow-y-auto">
                <div className="px-3.5 py-5">
                  <ResultsSection
                    results={results}
                    supervisor={supervisor}
                    fecha={fecha}
                    tiendas={(results.extTiendas || tiendas) as Parameters<typeof ResultsSection>[0]['tiendas']}
                    gps={results.extGps || gps}
                    cd={cdRef.current}
                    flota={flota}
                    conductores={conductores}
                    onLimpiar={handleLimpiar}
                    onVolver={handleVolverAEdicion}
                    onGenerarPDF={handleGenerarPDF}
                    onGuardarHistorial={handleGuardarHistorial}
                    onChoferChange={handleChoferChange}
                    historialStatus={historialStatus}
                    historialMsg={historialMsg}
                    onKmTotalReal={km => { kmTotalRealRef.current = km; }}
                    onCdUpdate={coords => { cdRef.current = coords; }}
                  />
                </div>
                <footer className="no-print border-t border-black/[0.09] py-[14px] text-center text-[11px] text-kmuted font-mono">
                  KiosClub · Sistema de Enrutamiento v4.3 · {Object.keys(tiendas).length} tiendas
                </footer>
              </div>
            ) : comparisonData ? (
              <div className="h-full overflow-y-auto">
                <div className="px-3.5 py-5">
                  <ComparisonView
                    data={comparisonData}
                    gps={comparisonData.extGps || gps}
                    cd={cdRef.current}
                    tiendas={(comparisonData.extTiendas || tiendas) as Record<string, TiendaInfo>}
                    onUsar={handleUsarRuta}
                    onVolver={handleVolverEditar}
                  />
                </div>
              </div>
            ) : undefined
          }
        />
      </main>

      <ParadasAdicionales
        isOpen={paradasOpen}
        paradas={paradasAdicionales}
        onAgregar={handleAgregarParada}
        onEliminar={handleEliminarParada}
        onClose={handleCloseParadas}
      />

      {configOpen && (
        <ConfigPanel
          isOpen={configOpen}
          cal={cal}
          tiendas={tiendas}
          dnom={DNOM}
          dcol={DCOL}
          onClose={handleCloseConfig}
          onSave={handleSaveConfig}
        />
      )}
    </div>
  );
}
