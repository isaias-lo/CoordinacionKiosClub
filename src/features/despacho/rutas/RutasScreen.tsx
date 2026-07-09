'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import Header         from './components/Header';
import InputSection   from './components/InputSection';
import ResultsSection from './components/ResultsSection';
import ManualDispatch from './components/ManualDispatch';
import ManifiestoPanel from './components/ManifiestoPanel';
import ConfigPanel    from './components/ConfigPanel';
import ComparisonView from './components/ComparisonView';
import ParadasAdicionales, { type Parada } from './components/ParadasAdicionales';

import { TIENDAS_INICIAL, GPS_INICIAL, CD_INICIAL } from './data/tiendas';
import { FLOTA_INICIAL } from './data/flota';
import { CAL_INICIAL, DNOM, DCOL } from './data/calendar';
import { getDia, norm, todayStr, fechaTxt } from './utils/helpers';
import { asignar, nn } from './utils/routing';
import type { Ruta, StoreItem } from './utils/routing';
import { fetchAuthenticatedSheet, parseTSheetAuth, parseFSheetAuth, parseCalendarioAuth, guardarDespachoSplitFn, actualizarPionetasRMFn } from './utils/sheets';
import { splitRoutingPorTabla, buildControlRows, agruparPorFechaOrigen, type Grupo, type RutaControl, type PendienteControl } from './utils/vueltaRegistro';
import { parseCerradas, serializeCerradas, mergeCerradas, isCerrada, rutasNoCerradas, todasCerradas, normPatente } from './utils/cierrePorVehiculo';
import { fetchCounts, subscribeToSesion } from '../../../lib/despachoSesion';
import { pushSessionState, fetchSessionState, subscribeToSessionState, fetchUnregisteredRutasDays, fetchPendientesV2Pasadas, type PendienteV2 } from '../../../lib/userSessionState';
import { supabase } from '../../../lib/supabase';
import { useDayRollover } from '@/hooks/useDayRollover';
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
  useDayRollover();  // recarga al cruzar medianoche → evita arrastrar tiendas/cantidades de ayer

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

  // 2ª vuelta: pendientes cross-device (keyed by dispatch fecha, NOT today)
  const [pendientesV2, setPendientesV2] = useState<{ c: string; p: number; b: number; ch: number }[]>([]);
  // Cierre de jornada: marca cross-device de "listo por hoy" (keyed by dispatch fecha)
  const [cerrado, setCerrado] = useState(false);

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

  const [modo,       setModo]       = useState('drag');
  const [grps,       setGrps]       = useState(new Set(['rm']));
  const [calT,       setCalT]       = useState<Record<string, CalData>>({});
  const [supervisor, setSupervisor] = useState('');
  const [fecha,      setFecha]      = useState(todayStr);
  const [manualText, setManualText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [iaLoading, setIaLoading] = useState(false);
  // Días PASADOS con asignaciones en el Enrutador pero sin registrar (aviso de recuperación).
  const [unregisteredDays, setUnregisteredDays] = useState<string[]>([]);

  const [results, setResults]           = useState<Results | null>(null);
  const kmTotalRealRef                  = useRef<number | null>(null);
  const [updateStatus,  setUpdateStatus]  = useState('idle');
  const [historialStatus, setHistorialStatus] = useState('idle');
  const [flotaStatus, setFlotaStatus]     = useState('idle');
  const [historialMsg,  setHistorialMsg]  = useState('');

  const [manualAsignaciones, setManualAsignaciones] = useState<Record<string, StoreItem[]>>({});
  // Fase B: patentes CERRADAS individualmente en 1ª vuelta (cierre por vehículo), keyed por fecha.
  // Cross-device vía shared_session_state fuente 'rutas_cerradas'. El registro global SALTA estas
  // rutas (HISTORIAL append-only) y el día se marca 'rutas_reg' solo cuando TODAS están cerradas.
  const [cerradasV1, setCerradasV1] = useState<Set<string>>(new Set());
  // ── Tab "2ª VUELTA": pendientes de días anteriores, board y manifiesto AISLADOS del día actual ──
  const [pendientesV2Origen, setPendientesV2Origen] = useState<PendienteV2[]>([]);
  const [asignacionesV2, setAsignacionesV2]         = useState<Record<string, StoreItem[]>>({});
  const [manifiestoV2, setManifiestoV2]             = useState<Ruta[] | null>(null);
  // Fase B: manifiesto de un solo camión cerrado en 1ª vuelta (cierre por vehículo).
  const [manifiestoV1, setManifiestoV1]             = useState<Ruta[] | null>(null);
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);

  const [paradasAdicionales, setParadasAdicionales] = useState<Parada[]>([]);
  const paradaCounter = useRef(0);
  const [paradasOpen, setParadasOpen] = useState(false);
  const [configOpen,  setConfigOpen]  = useState(false);

  const grpsRef = useRef(grps);
  useEffect(() => { grpsRef.current = grps; }, [grps]);

  const fechaRef = useRef(fecha);
  useEffect(() => { fechaRef.current = fecha; }, [fecha]);
  // Últimas filas de despacho_sesion (de otros equipos), por cod normalizado.
  // Se re-aplican al inicializar calT desde el calendario (evita perder counts si
  // los counts llegan antes de que cargue el calendario). #4
  const sesionRowsRef = useRef<Map<string, SesionRow>>(new Map());

  // Chips where the user has manually typed a P/B value — excluded from live sync
  const manuallyEditedRef = useRef<Set<string>>(new Set());

  const sessionRestoredRef = useRef(false);
  const restoringRef       = useRef(false);

  // ── Real-time sync: manualAsignaciones across devices ────────────
  const lastPushedManualRef = useRef<string>('');
  const debounceManualRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualInitRef     = useRef(false);

  // ── Real-time sync: cerradasV1 (patentes cerradas por vehículo) across devices ──
  const lastPushedCerradasRef = useRef<string>('');
  const isCerradasInitRef      = useRef(false);

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
      const c = norm(row.tienda_cod);
      sesionRowsRef.current.set(c, row);  // recordar para re-aplicar si el calendario carga después
      setCalT(prev => {
        if (manuallyEditedRef.current.has(c)) return prev;
        // #4: el calendario manda. despacho_sesion SOLO actualiza los counts de tiendas
        // que YA están en el calendario del día; NO inyecta tiendas fuera de él (antes
        // esto arrastraba "tiendas de ayer" / fuera de calendario e inflaba la lista).
        if (!prev[c]) return prev;
        const rowCh = row.chocolates ?? 0;
        if (prev[c].p === row.pallets && prev[c].b === row.bultos && prev[c].c === (row.contenedores ?? 0) && (prev[c].ch ?? 0) === rowCh) return prev;
        return {
          ...prev,
          [c]: { ...prev[c], p: row.pallets, b: row.bultos, c: row.contenedores ?? 0, ch: rowCh, on: row.pallets > 0 || row.bultos > 0 || (row.contenedores ?? 0) > 0 || rowCh > 0 },
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

  // ── Load tiendas from Supabase (source of truth) ─────────────────
  // Merges Supabase records over TIENDAS_INICIAL/GPS_INICIAL (which stay as fallback).
  // Skips inactive stores (activo === false), same criterion as CalendarioColumnas.
  // Resilient: silently ignores errors so the router keeps working on failure.
  useEffect(() => {
    fetch('/api/tiendas')
      .then(r => r.ok ? r.json() : null)
      .then((json: {
        tiendas?: Array<{
          codigo: string;
          nombre: string;
          direccion?: string;
          region?: string;
          sector_comuna?: string;
          corredor?: string;
          tipo?: string;
          ventana?: string;
          frecuencia?: string;
          lat?: number | null;
          lon?: number | null;
          activo?: boolean;
        }>
      } | null) => {
        if (!json?.tiendas?.length) return;
        const tiendasPatch: Record<string, TiendaInfo> = {};
        const gpsPatch: Record<string, number[]> = {};
        for (const t of json.tiendas) {
          if (t.activo === false) continue;
          const cod = norm(t.codigo);
          if (!cod) continue;
          tiendasPatch[cod] = {
            n: t.nombre,
            z: t.sector_comuna || t.corredor || '',
            v: t.ventana || '',
            d: t.direccion,
            region: t.region,
            corredor: t.corredor,
            tipo: t.tipo,
            frecuencia: t.frecuencia,
          };
          // Valid Chile GPS range (same bounds as parseTSheetAuth)
          if (
            t.lat != null && t.lon != null &&
            !isNaN(t.lat) && !isNaN(t.lon) &&
            t.lat > -60 && t.lat < -17 &&
            t.lon > -76 && t.lon < -66
          ) {
            gpsPatch[cod] = [t.lat, t.lon];
          }
        }
        if (Object.keys(tiendasPatch).length > 0) {
          setTiendas(prev => ({ ...prev, ...tiendasPatch }));
        }
        if (Object.keys(gpsPatch).length > 0) {
          setGps(prev => ({ ...prev, ...gpsPatch }));
        }
      })
      .catch(() => {}); // Resilient: never break the router on API failure
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── Fetch + subscribe manualAsignaciones (cross-device, por fecha) ──────────
  // Depende de `fecha`: al cambiar el día (p. ej. a uno pasado que quedó sin registrar),
  // recarga las asignaciones de ESE día. El guard isManualInitRef evita que el push
  // debounced pise el día recién cargado con las asignaciones del día anterior.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    isManualInitRef.current = false;

    fetchSessionState('rutas', fecha).then(remote => {
      const remoteObj = (remote && typeof remote === 'object') ? remote as Record<string, StoreItem[]> : {};
      setManualAsignaciones(remoteObj);
      lastPushedManualRef.current = JSON.stringify(remoteObj);
      isManualInitRef.current = true;
    }).catch(() => { isManualInitRef.current = true; });

    const unsub = subscribeToSessionState('rutas', userId ?? '', (state) => {
      if (!state || typeof state !== 'object') return;
      const remoteJson = JSON.stringify(state);
      if (remoteJson === lastPushedManualRef.current) return;
      lastPushedManualRef.current = remoteJson;
      setManualAsignaciones(state as Record<string, StoreItem[]>);
    }, undefined, fecha);

    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  // ── Debounced push manualAsignaciones → Supabase ─────────────────
  useEffect(() => {
    if (!isManualInitRef.current) return;
    const json = JSON.stringify(manualAsignaciones);
    if (json === lastPushedManualRef.current) return;
    if (debounceManualRef.current) clearTimeout(debounceManualRef.current);
    debounceManualRef.current = setTimeout(() => {
      lastPushedManualRef.current = json;
      pushSessionState('rutas', manualAsignaciones, userId, fecha).catch(() => {});
    }, 800);
    return () => {
      if (debounceManualRef.current) clearTimeout(debounceManualRef.current);
    };
  }, [manualAsignaciones, userId, fecha]);

  // ── Fetch + subscribe cerradasV1 (cross-device, por fecha) ─────────────────
  // Mismo patrón que manualAsignaciones: fetch al montar/cambiar fecha + subscribe realtime.
  // El merge es la UNIÓN (cerrar es monótono) para no perder cierres locales ante ecos viejos.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    isCerradasInitRef.current = false;

    fetchSessionState('rutas_cerradas', fecha).then(remote => {
      const set = parseCerradas(remote);
      setCerradasV1(set);
      lastPushedCerradasRef.current = JSON.stringify([...set].sort());
      isCerradasInitRef.current = true;
    }).catch(() => { isCerradasInitRef.current = true; });

    const unsub = subscribeToSessionState('rutas_cerradas', userId ?? '', (state) => {
      const remote = parseCerradas(state);
      setCerradasV1(prev => {
        const merged = mergeCerradas(prev, remote);
        lastPushedCerradasRef.current = JSON.stringify([...merged].sort());
        return merged;
      });
    }, undefined, fecha);

    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  // Persistir cerradasV1 (cross-device). Se llama tras cada cierre por vehículo.
  const pushCerradasV1 = (next: Set<string>) => {
    const json = JSON.stringify([...next].sort());
    if (json === lastPushedCerradasRef.current) return;
    lastPushedCerradasRef.current = json;
    void pushSessionState('rutas_cerradas', serializeCerradas(next), userId, fecha).catch(() => {});
  };

  // ── Días pasados con asignaciones sin registrar (aviso de recuperación) ──
  useEffect(() => {
    fetchUnregisteredRutasDays().then(setUnregisteredDays).catch(() => {});
  }, []);

  // Descartar un día del aviso de forma PERMANENTE (no solo ocultar): marca ese día como
  // cerrado en el Enrutador (p. ej. ya se registró a mano en las hojas). Usa el mismo marcador
  // que el registro ('rutas_reg') para que fetchUnregisteredRutasDays deje de listarlo.
  const dismissUnregisteredDay = (d: string) => {
    setUnregisteredDays(prev => prev.filter(x => x !== d));
    void pushSessionState('rutas_reg', { dismissed: true, at: new Date().toISOString() }, userId, d);
  };

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
    // #4: re-aplicar counts de despacho_sesion ya recibidos (solo a tiendas del
    // calendario; no inyecta). Cubre la carrera "counts llegan antes que el calendario".
    sesionRowsRef.current.forEach((row, c) => {
      if (newCalT[c] && !manuallyEditedRef.current.has(c)) {
        const cc = row.contenedores ?? 0;
        const chh = row.chocolates ?? 0;
        newCalT[c] = { ...newCalT[c], p: row.pallets, b: row.bultos, c: cc, ch: chh, on: row.pallets > 0 || row.bultos > 0 || cc > 0 || chh > 0 };
      }
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
    const v = flota[idx];
    if (!v) return;
    const newOn = !v.on;
    setFlota(prev => prev.map((x, i) => i === idx ? { ...x, on: newOn } : x));
    // Persistir "en servicio" (memoria permanente). Fire-and-forget; el toggle solo
    // {p,on} no requiere admin (ver /api/flota PATCH).
    fetch('/api/flota', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p: v.p, on: newOn }),
    }).catch(() => {});
  }
  function handleToggleTlbd(idx: number) {
    setFlota(prev => prev.map((v, i) => i === idx ? { ...v, tlbd: !v.tlbd } : v));
  }
  // [Fase 3] Conductor/pionetas ya no se editan en la tarjeta de Vehículos: se asignan por
  // ruta en FLOTA → Gestionar (post-registro). handleChoferChange (RouteCard) sigue existiendo.
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

  // ── Segunda vuelta: pendientes Supabase ──────────────────────────
  // ACUMULA en vez de sobrescribir: mantiene las pendientes previas de esa fecha que NO se
  // asignaron en esta ronda, les une las nuevas no asignadas (counts frescos) y quita las que
  // se asignaron. Así un registro parcial (p. ej. la 2ª vuelta de un subconjunto) NO borra las
  // demás pendientes del día; y al asignarlas por fin, dejan de ser pendientes.
  async function savePendientesV2(
    fechaDespacho: string,
    noAsignadas: { c: string; p: number; b: number; ch: number }[],
    asignadas: Set<string>,
  ): Promise<void> {
    const byCod = new Map<string, { c: string; p: number; b: number; ch: number }>();
    try {
      const { data } = await supabase
        .from('shared_session_state')
        .select('state')
        .eq('fecha', fechaDespacho)
        .eq('fuente', 'segunda_vuelta')
        .maybeSingle();
      const prev = ((data?.state as { stores?: { c: string; p: number; b: number; ch: number }[] } | null)?.stores) ?? [];
      for (const s of prev) if (!asignadas.has(s.c)) byCod.set(s.c, s); // previas que siguen sin asignar
    } catch {}
    for (const s of noAsignadas) byCod.set(s.c, s); // nuevas no asignadas (counts frescos)
    const stores = [...byCod.values()];

    const payload = { savedAt: new Date().toISOString(), fecha: fechaDespacho, stores };
    try { localStorage.setItem('despacho_pendientes_v2', JSON.stringify(payload)); } catch {}
    supabase
      .from('shared_session_state')
      .upsert({ fecha: fechaDespacho, fuente: 'segunda_vuelta', state: payload }, { onConflict: 'fecha,fuente' })
      .then(({ error }) => { if (error) console.error('[pendientes-v2]', error.message); });
    setPendientesV2(stores);
  }

  useEffect(() => {
    // 1. Quick path: localStorage
    try {
      const raw = localStorage.getItem('despacho_pendientes_v2');
      if (raw) {
        const saved = JSON.parse(raw) as { fecha: string; stores: { c: string; p: number; b: number; ch: number }[] };
        if (saved.fecha === fecha && saved.stores.length > 0) {
          setPendientesV2(saved.stores);
          return;
        }
      }
    } catch {}
    // 2. Cross-device path: Supabase keyed by dispatch fecha
    void (async () => {
      try {
        const { data } = await supabase
          .from('shared_session_state')
          .select('state')
          .eq('fecha', fecha)
          .eq('fuente', 'segunda_vuelta')
          .maybeSingle();
        const s = data?.state as { stores?: { c: string; p: number; b: number; ch: number }[] } | null;
        setPendientesV2(s?.stores?.length ? s.stores : []);
      } catch {}
    })();
  }, [fecha]);

  // [Punto 2] Al abrir una fecha PASADA, cargar en el pool TODAS las tiendas de bodega de ese
  // día (despacho_sesion), no solo las asignadas. Así las que quedaron sin asignar (p. ej. las
  // que se apartaron para 2ª vuelta) aparecen y se pueden asignar/registrar de forma retroactiva.
  // Solo AGREGA tiendas que no estén ya en calT (no pisa las asignaciones cargadas).
  useEffect(() => {
    if (fecha >= todayStr()) return; // solo días pasados
    let cancelled = false;
    void (async () => {
      const rows = await fetchCounts(fecha).catch(() => [] as SesionRow[]);
      if (cancelled || !rows.length) return;
      const dia = getDia(fecha);
      const calDia = (cal[dia] || cal.LU || {}) as Record<string, string[]>;
      const grpOf = (c: string): string => {
        for (const g of ['rm', 'costa', 'fal']) if ((calDia[g] || []).some(x => norm(x) === c)) return g;
        return 'rm';
      };
      setCalT(prev => {
        const next = { ...prev };
        let changed = false;
        for (const row of rows) {
          const c  = norm(row.tienda_cod);
          const p  = row.pallets, b = row.bultos, cc = row.contenedores ?? 0, ch = row.chocolates ?? 0;
          if (p === 0 && b === 0 && cc === 0 && ch === 0) continue;
          if (!next[c]) { next[c] = { on: true, p, b, c: cc, ch, g: grpOf(c) }; changed = true; }
        }
        return changed ? next : prev;
      });
    })();
    return () => { cancelled = true; };
  }, [fecha, cal]);

  function handleCargarPendientes() {
    if (!pendientesV2.length) return;
    const txt = pendientesV2.map(s => `${s.c} ${s.p}P${s.b ? ' ' + s.b + 'B' : ''}`).join('\n');
    setManualText(txt);
    setModo('man');
  }

  // ── Tab "2ª VUELTA": cargar pendientes de días anteriores (aislado del día actual) ──
  useEffect(() => {
    fetchPendientesV2Pasadas().then(setPendientesV2Origen).catch(() => {});
  }, []);

  // Pool del tab V2: derivado de las pendientes de días anteriores (con grupo desde el calendario).
  const calTV2 = useMemo<Record<string, CalData>>(() => {
    const dia = getDia(todayStr());
    const calDia = (cal[dia] || cal.LU || {}) as Record<string, string[]>;
    const grpOf = (cod: string): string => {
      for (const g of ['rm', 'costa', 'fal']) if ((calDia[g] || []).some(x => norm(x) === cod)) return g;
      return 'rm';
    };
    const out: Record<string, CalData> = {};
    for (const s of pendientesV2Origen) {
      const cod = norm(s.c);
      if (!out[cod]) out[cod] = { on: true, p: 0, b: 0, c: 0, ch: 0, g: grpOf(cod) };
      out[cod].p += s.p; out[cod].b += s.b; out[cod].ch += s.ch;
    }
    return out;
  }, [pendientesV2Origen, cal]);

  // Cerrar un camión de 2ª vuelta: registra SOLO ese camión (vuelta 2 → patente en columna
  // "2ª Vuelta"), genera su manifiesto y quita esas tiendas de las pendientes de su fecha ORIGEN.
  // Clave: cada tienda se registra bajo su FECHA DE ORIGEN (el día que quedó pendiente), no "hoy",
  // para que rellene la "Patente 2. Vuelta" de la fila existente (upsert por fecha::cod) en vez de
  // crear una fila nueva bajo hoy (bug de duplicado). Una tienda puede venir de varios días.
  function cerrarCamionV2(patente: string) {
    const stores = asignacionesV2[patente] || [];
    if (!stores.length) return;
    const vehicle = flota.find(v => v.p === patente);
    if (!vehicle) return;
    const hoy = todayStr();
    const conductor = vehicle.ch || '';
    const grupoPorCod = (cod: string): Grupo | undefined =>
      (calTV2[norm(cod)]?.g ?? calT[norm(cod)]?.g) as Grupo | undefined;
    const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    // Agrupar las tiendas del camión por su fecha de ORIGEN (fallback a hoy si no se conoce).
    const porFecha = agruparPorFechaOrigen(stores, pendientesV2Origen, hoy, norm);
    const manifiestoRutas: Ruta[] = [];

    for (const [fechaReg, grupoStores] of porFecha) {
      const ruta: Ruta = {
        v: { ...vehicle, tlbd: true }, // TLBD → 2ª vuelta (patente a columna v2)
        ts: grupoStores,
        tp: grupoStores.reduce((s, t) => s + t.p, 0),
        tb: grupoStores.reduce((s, t) => s + t.b + (t.ch ?? 0), 0),
      };
      manifiestoRutas.push(ruta);

      // 1) despacho_rm / despacho_regiones: conductor/patente/ruta (vuelta 2) bajo la fecha ORIGEN
      const routingUpdates = grupoStores.map(t => ({
        cod: t.c, conductor, patente, transporte: vehicle.empresa || 'Luis Fica',
        ruta: '1', supervisor, vuelta: 2, pioneta_1: vehicle.p1 ?? null, pioneta_2: vehicle.p2 ?? null,
      }));
      const porTabla = splitRoutingPorTabla(routingUpdates, grupoPorCod);
      (['despacho_rm', 'despacho_regiones'] as const).forEach(table => {
        if (!porTabla[table].length) return;
        fetch('/api/despacho-records', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fecha: fechaReg, table, updates: porTabla[table] }),
        }).catch(e => console.error(`[v2 despacho-records ${table}]`, e));
      });

      // 2) Hojas DESPACHO RM/REGIONES (1 ruta) + pionetas — bajo la fecha ORIGEN
      void guardarDespachoSplitFn({ fecha: fechaReg, supervisor, rutas: [ruta], tiendas, grupoPorCod });
      actualizarPionetasRMFn({ fecha: fechaReg, rutas: [ruta] });

      // 3) CONTROL DESPACHO: patente en columna "2ª Vuelta" (tlbd=true) → upsert sobre la fila origen
      const fechaDDMM = fechaReg.split('-').reverse().join('/');
      const diaCD = DIAS[new Date(fechaReg + 'T12:00').getDay()];
      const rutasControl: RutaControl[] = [{ patente, tlbd: true, ts: grupoStores.map(t => ({ c: t.c, p: t.p, b: t.b, ch: t.ch ?? 0 })) }];
      const controlRows = buildControlRows(fechaDDMM, diaCD, rutasControl, [] as PendienteControl[]);
      if (controlRows.length) {
        fetch('/api/sheets-write', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sheet: 'CONTROL DESPACHO', rows: controlRows }) }).catch(e => console.error('[v2 control]', e));
      }

      // 4) HISTORIAL (marca vuelta 2) — bajo la fecha ORIGEN
      const histRow: (string | number)[] = [fechaDDMM, fechaTxt(fechaReg), supervisor, patente, conductor, '2', grupoStores.length, ruta.tp, ruta.tb, 0, grupoStores.map(t => t.c).join(', '), '1'];
      fetch('/api/sheets-write', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheet: 'HISTORIAL', rows: [histRow] }) }).catch(e => console.error('[v2 historial]', e));
    }

    // 5) Quitar las despachadas de las pendientes de su fecha ORIGEN (acumulativo: quita las asignadas)
    const despachados = new Set(stores.map(t => norm(t.c)));
    const porOrigen = new Map<string, Set<string>>();
    for (const p of pendientesV2Origen) {
      if (despachados.has(norm(p.c))) {
        if (!porOrigen.has(p.fechaOrigen)) porOrigen.set(p.fechaOrigen, new Set());
        porOrigen.get(p.fechaOrigen)!.add(p.c); // código tal cual está guardado, para casar en savePendientesV2
      }
    }
    porOrigen.forEach((cods, fechaOrigen) => { void savePendientesV2(fechaOrigen, [], cods); });

    // 6) Limpiar estado local + abrir manifiesto de ese camión
    setAsignacionesV2(prev => { const n = { ...prev }; delete n[patente]; return n; });
    setPendientesV2Origen(prev => prev.filter(p => !despachados.has(norm(p.c))));
    setManifiestoV2(manifiestoRutas);
  }

  // ── Fase B: postear el summary del día (INSERT en historial_despacho, primario) ──
  // Nota: /api/historial-despacho hace INSERT (append), NO upsert → hay que postearlo UNA sola
  // vez por día. Por eso el cierre por vehículo NO postea summary por camión (igual que V2), y
  // el summary del día se postea solo (a) en el registro global, o (b) al cerrar el ÚLTIMO camión.
  async function postSummaryDiaFn(rutas: Ruta[]): Promise<void> {
    const totalPallets = rutas.reduce((acc, r) => acc + r.ts.reduce((a, t) => a + t.p, 0), 0);
    const totalBultos  = rutas.reduce((acc, r) => acc + r.ts.reduce((a, t) => a + t.b + ((t as { ch?: number }).ch ?? 0), 0), 0);
    const totalTiendas = new Set(rutas.flatMap(r => r.ts.map(t => t.c))).size;
    const totalRutas   = rutas.length;
    const kmTotal      = Math.round((rutas.reduce((acc, r) => acc + (r._kmReal ?? 0), 0)) * 10) / 10;
    await fetch('/api/historial-despacho', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fecha, supervisor, totalTiendas, totalPallets, totalBultos, totalRutas, kmTotal,
        resumen: rutas.map(r => ({
          patente: r.v.p, conductor: r._choferAsignado || r.v.ch,
          tiendas: r.ts.map(t => t.c), pallets: r.tp, bultos: r.tb,
        })),
      }),
    });
  }

  // ── Fase B: Cerrar un camión de 1ª VUELTA (cierre por vehículo) ──────────────────
  // Registra SOLO ese camión (fecha del día, vuelta 1 → patente en columna v1), genera su
  // manifiesto y lo añade a `cerradasV1` (cross-device). NO postea el summary del día por
  // camión (append-only) salvo que con este cierre queden TODAS las rutas cerradas: en ese caso
  // postea el summary una vez y marca el día `rutas_reg` (igual que el registro global).
  function cerrarCamionV1(patente: string) {
    if (!results) return;
    if (isCerrada(cerradasV1, patente)) return; // ya cerrado → idempotente, no re-escribir
    const ruta = results.rutas.find(r => normPatente(r.v.p) === normPatente(patente));
    if (!ruta || ruta.ts.length === 0) return;

    const conductor = ruta._choferAsignado || ruta.v.ch || '';
    const empresa   = ruta.v.empresa || 'Luis Fica';
    const grupoPorCod = (cod: string): Grupo | undefined => calT[norm(cod)]?.g as Grupo | undefined;

    // 1) despacho_rm / despacho_regiones: conductor/patente/ruta (vuelta 1)
    const routingUpdates = ruta.ts.map(t => ({
      cod: t.c, conductor, patente, transporte: empresa,
      ruta: '1', supervisor, vuelta: 1, pioneta_1: ruta.v.p1 ?? null, pioneta_2: ruta.v.p2 ?? null,
    }));
    const porTabla = splitRoutingPorTabla(routingUpdates, grupoPorCod);
    (['despacho_rm', 'despacho_regiones'] as const).forEach(table => {
      if (!porTabla[table].length) return;
      fetch('/api/despacho-records', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, table, updates: porTabla[table] }),
      }).catch(e => console.error(`[v1 despacho-records ${table}]`, e));
    });

    // 2) Hojas DESPACHO RM/REGIONES (1 ruta) + pionetas
    void guardarDespachoSplitFn({ fecha, supervisor, rutas: [ruta], tiendas, grupoPorCod });
    actualizarPionetasRMFn({ fecha, rutas: [ruta] });

    // 3) CONTROL DESPACHO: patente en columna "1ª Vuelta" (tlbd=false)
    const fechaDDMM = fecha.split('-').reverse().join('/');
    const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaCD = DIAS[new Date(fecha + 'T12:00').getDay()];
    const rutasControl: RutaControl[] = [{ patente, tlbd: false, ts: ruta.ts.map(t => ({ c: t.c, p: t.p, b: t.b, ch: (t as { ch?: number }).ch ?? 0 })) }];
    const controlRows = buildControlRows(fechaDDMM, diaCD, rutasControl, [] as PendienteControl[]);
    if (controlRows.length) {
      fetch('/api/sheets-write', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheet: 'CONTROL DESPACHO', rows: controlRows }) }).catch(e => console.error('[v1 control]', e));
    }

    // 4) HISTORIAL (append, marca vuelta 1) — 1 fila para este camión
    const histRow: (string | number)[] = [fechaDDMM, fechaTxt(fecha), supervisor, patente, conductor, '1', ruta.ts.length, ruta.tp, ruta.tb, ruta._kmReal ?? 0, ruta.ts.map(t => t.c).join(', '), '1'];
    fetch('/api/sheets-write', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheet: 'HISTORIAL', rows: [histRow] }) }).catch(e => console.error('[v1 historial]', e));

    // 5) Marcar la patente como cerrada (cross-device) y abrir su manifiesto
    const next = mergeCerradas(cerradasV1, [patente]);
    setCerradasV1(next);
    pushCerradasV1(next);
    setManifiestoV1([ruta]);

    // 6) Si con este cierre quedan TODAS las rutas cerradas → completar el día:
    //    postear summary (una vez) y marcar 'rutas_reg' (igual que el registro global).
    if (todasCerradas(results.rutas, next)) {
      void postSummaryDiaFn(results.rutas).catch(e => console.error('[v1 summary día]', e));
      void pushSessionState('rutas_reg', { at: new Date().toISOString(), supervisor, byVehiculo: true }, userId, fecha);
      setUnregisteredDays(prev => prev.filter(d => d !== fecha));
    }
  }

  // ── Cierre de jornada: marca "listo por hoy" cross-device ─────────
  useEffect(() => {
    setCerrado(false);
    void (async () => {
      try {
        const { data } = await supabase
          .from('shared_session_state')
          .select('state')
          .eq('fecha', fecha)
          .eq('fuente', 'cierre')
          .maybeSingle();
        if (data?.state) setCerrado(true);
      } catch {}
    })();
  }, [fecha]);

  function handleListoPorHoy() {
    const payload = { closedAt: new Date().toISOString(), by: supervisor || '' };
    setCerrado(true);
    supabase
      .from('shared_session_state')
      .upsert({ fecha, fuente: 'cierre', state: payload }, { onConflict: 'fecha,fuente' })
      .then(({ error }) => { if (error) console.error('[cierre-jornada]', error.message); });
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

  // ── Calculate routes (modo MANUAL) ───────────────────────────────
  // Nota: el tab CALCULAR fue eliminado; este handler sólo se activa desde el modo MANUAL.
  function handleCalcular() {
    const errs: string[] = [];
    const tx = manualText.trim();
    if (!tx) { setErrors(['Ingresa al menos una tienda.']); return; }
    const r = parseManual(tx);
    let ts: StoreItem[] = r.ts; errs.push(...r.errs);

    if (errs.length) setErrors(errs); else setErrors([]);
    if (!ts.length) { setErrors(prev => [...prev, 'No hay tiendas válidas.']); return; }

    const { extGps, extTiendas } = buildExtendidos(gps, tiendas);
    paradasAdicionales.filter(p => p.gps).forEach(p => ts.push({ c: p.id, p: p.p, b: p.b }));

    const rutas = asignar(ts, flota, extGps, cdRef.current, null, null, null, extTiendas);
    setResults({ ts, rutas, extGps, extTiendas });
    kmTotalRealRef.current = null;

    // Guardar tiendas sin asignar para segunda vuelta (cross-device via Supabase, keyed by fecha dispatch)
    const asignadas = new Set(rutas.flatMap(r => r.ts.map(t => t.c)));
    const noAsignadas = ts.filter(t => !asignadas.has(t.c) && !t.c.startsWith('_P'));
    const pendV2 = noAsignadas.map(t => ({ c: t.c, p: t.p, b: t.b, ch: (calT[t.c]?.ch ?? 0) }));
    void savePendientesV2(fecha, pendV2, asignadas);
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

  // ── Asistente IA: propone la asignación tienda→patente aprendiendo del historial ──────
  // Junta las tiendas activas del pool + la flota activa (no-2ªvuelta) → POST /api/asignar-ia →
  // aplica la propuesta a manualAsignaciones (llena el tablero, se sincroniza) y muestra warnings.
  async function handleAsignarIA() {
    const stores = Object.keys(calT)
      .filter(c => calT[c].on && (calT[c].p > 0 || calT[c].b > 0))
      .map(c => ({ cod: c, p: calT[c].p, b: calT[c].b, ch: calT[c].ch ?? 0, zona: tiendas[c]?.z || tiendas[c]?.corredor || '' }));
    const trucks = flota
      .filter(v => v.on && !v.tlbd)
      .map(v => ({ patente: v.p, tipo: v.t, capP: v.c, capB: v.b, refrigerado: !!v.refrigerado, porton: !!v.porton }));
    if (!stores.length) { setErrors(['No hay tiendas con carga para asignar con IA.']); return; }
    if (!trucks.length) { setErrors(['No hay camiones activos para asignar.']); return; }
    setErrors([]);
    setIaLoading(true);
    try {
      const res  = await fetch('/api/asignar-ia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, stores, trucks }),
      });
      const json = await res.json() as { asignaciones?: Record<string, StoreItem[]>; warnings?: string[]; error?: string };
      if (!res.ok) { setErrors([`Asistente IA: ${json.error ?? `error ${res.status}`}`]); return; }
      setManualAsignaciones(json.asignaciones ?? {});
      setErrors(json.warnings ?? []); // el tablero lleno es la confirmación; solo mostramos avisos si hay
    } catch {
      setErrors(['No se pudo conectar con el asistente IA.']);
    } finally {
      setIaLoading(false);
    }
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
  async function handleGuardarHistorial(): Promise<boolean> {
    if (!results) { setHistorialStatus('warn'); setHistorialMsg('⚠️ No hay rutas calculadas.'); return false; }
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
      return false; // No continuar con las sincronizaciones secundarias si Supabase falló
    }

    // Fase B: para las escrituras append-only / de registro por camión, SALTAR las rutas cuyas
    // patentes ya se cerraron individualmente (cerradasV1) — así el global no DUPLICA en HISTORIAL
    // (append-only) ni re-registra lo ya cerrado. El summary del día (arriba) sí incluye TODO.
    const rutasReg = rutasNoCerradas(results.rutas, cerradasV1);

    // 2. SECONDARY (fire-and-forget): actualiza conductor/ruta en despacho_rm y picking_pallets
    const routingUpdates = rutasReg.flatMap((ruta, ri) => {
      const conductor = ruta._choferAsignado || ruta.v.ch || '';
      const patente   = ruta.v.p;
      const empresa   = ruta.v.empresa || 'Luis Fica';
      const rutaNum   = String(ri + 1);
      const vuelta    = ruta.v.tlbd ? 2 : 1;
      const pioneta_1 = ruta.v.p1 ?? null;
      const pioneta_2 = ruta.v.p2 ?? null;
      return ruta.ts.map(ts => ({ cod: ts.c, conductor, patente, transporte: empresa, ruta: rutaNum, supervisor, vuelta, pioneta_1, pioneta_2 }));
    });
    // #9: separar por grupo → RM/Costa a despacho_rm, Regiones a despacho_regiones
    // (antes todo iba a despacho_rm y la patente de Regiones se perdía).
    const porTabla = splitRoutingPorTabla(routingUpdates, c => calT[c]?.g as Grupo | undefined);
    (['despacho_rm', 'despacho_regiones'] as const).forEach(table => {
      const updates = porTabla[table];
      if (updates.length === 0) return;
      fetch('/api/despacho-records', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fecha, table, updates }),
      }).catch(e => console.error(`[despacho-records PATCH ${table}]`, e));
    });

    // 3. SECONDARY: sincroniza DESPACHO RM y DESPACHO REGIONES en Sheets. Si alguna tienda
    //    ruteada no tenía fila de Bodega, el server la AGREGA y devuelve su cod → avisamos
    //    (antes esas tiendas se perdían en silencio, ej. 56PZA).
    if (rutasReg.length > 0) {
      actualizarPionetasRMFn({ fecha, rutas: rutasReg });
      guardarDespachoSplitFn({ fecha, supervisor, rutas: rutasReg, tiendas, grupoPorCod: c => calT[c]?.g as Grupo | undefined })
        .then(appended => {
          if (appended.length > 0) {
            const uniq = [...new Set(appended)];
            setHistorialMsg(`✓ Guardado · ⚠ ${uniq.length} tienda${uniq.length !== 1 ? 's' : ''} sin datos de Bodega se registró solo con ruteo: ${uniq.join(', ')}`);
            setHistorialStatus('warn');
          }
        })
        .catch(e => console.error('[guardarDespachoSplit]', e));
    }

    // 4. SECONDARY (fire-and-forget): escribe en HISTORIAL de Google Sheets directamente
    const fechaDDMM = fecha.split('-').reverse().join('/'); // YYYY-MM-DD → DD/MM/YYYY
    const fechaLeg  = fechaTxt(fecha);
    // Solo las rutas NO cerradas individualmente (evita duplicar en HISTORIAL, append-only).
    const historialRows: (string | number)[][] = rutasReg.map((r, ri) => [
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
    if (historialRows.length > 0) {
      fetch('/api/sheets-write', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sheet: 'HISTORIAL', rows: historialRows }),
      }).catch(e => console.error('[historial-sheets]', e));
    }

    // 5. SECONDARY (fire-and-forget): escribe en CONTROL DESPACHO (upsert por fecha::cod).
    // #9: las pendientes (lo NO ruteado) se calculan AQUÍ desde results.ts − results.rutas, así
    // funciona sin importar el modo (auto/manual/arrastrar). Antes solo se poblaban en modo 'cal',
    // por eso al asignar arrastrando no aparecían en CONTROL DESPACHO ni se guardaban.
    const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const diaCD = DIAS[new Date(fecha + 'T12:00').getDay()];
    const asignadasReg = new Set(results.rutas.flatMap(r => r.ts.map(t => t.c)));
    const pendientesReg = results.ts
      .filter(t => !asignadasReg.has(t.c) && !t.c.startsWith('_P'))
      .map(t => ({ c: t.c, p: t.p, b: t.b, ch: (calT[t.c]?.ch ?? (t as { ch?: number }).ch ?? 0) }));
    // Solo las rutas NO cerradas individualmente (las cerradas ya escribieron su fila en CONTROL;
    // upsert-by-cod es idempotente, pero saltarlas mantiene consistencia con HISTORIAL).
    const rutasControl: RutaControl[] = rutasReg.map(ruta => ({
      patente: ruta.v.p,
      tlbd:    !!ruta.v.tlbd,
      ts:      ruta.ts.map(t => ({ c: t.c, p: t.p, b: t.b, ch: (t as { ch?: number }).ch ?? 0 })),
    }));
    const pendientesControl: PendienteControl[] = pendientesReg.map(s => ({ c: s.c, p: s.p, b: s.b, ch: s.ch }));
    const controlRows = buildControlRows(fechaDDMM, diaCD, rutasControl, pendientesControl);
    if (controlRows.length > 0) {
      fetch('/api/sheets-write', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sheet: 'CONTROL DESPACHO', rows: controlRows }),
      }).catch(e => console.error('[control-despacho]', e));
    }

    // 6. Guardar las pendientes de 2ª vuelta (cross-device, keyed by fecha) — lo NO ruteado.
    //    Acumula con las previas y quita las que se asignaron en esta ronda (no sobrescribe).
    void savePendientesV2(fecha, pendientesReg, asignadasReg);

    // 7. Marca este día como REGISTRADO → apaga el aviso de "sin registrar" para esta fecha.
    void pushSessionState('rutas_reg', { at: new Date().toISOString(), supervisor }, userId, fecha);
    setUnregisteredDays(prev => prev.filter(d => d !== fecha));

    return true; // guardado primario OK → habilita encadenar con manifiestos
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

      {/* Pill de pendientes 2ª vuelta (misma fecha) */}
      {pendientesV2.length > 0 && (
        <div className="flex-shrink-0 px-4 py-1.5 bg-kred/10 border-b border-kred/20 flex items-center gap-2">
          <button
            onClick={handleCargarPendientes}
            className="text-[11px] font-bold px-2.5 py-1 rounded-[8px] border-2 border-kred text-kred bg-kred/[0.08] hover:bg-kred/[0.15] transition-colors active:scale-95"
          >
            ⚠ {pendientesV2.length} pendiente{pendientesV2.length !== 1 ? 's' : ''} 2ª vuelta — Cargar
          </button>
          <span className="text-[10px] text-kred/60 font-semibold">salida {fechaTxt(fecha)}</span>
          <span className="text-[10px] text-kred/50">· {pendientesV2.map(s => s.c).join(', ')}</span>
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

      {/* Aviso: días pasados con asignaciones que quedaron SIN registrar (recuperación) */}
      {unregisteredDays.length > 0 && (
        <div className="mx-3 mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <span className="text-[18px] leading-none mt-0.5">⚠️</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-amber-900">
                {unregisteredDays.length === 1
                  ? 'Un día quedó con asignaciones sin registrar'
                  : `${unregisteredDays.length} días quedaron con asignaciones sin registrar`}
              </div>
              <div className="text-[12px] text-amber-700 mt-0.5">
                Las asignaciones se guardaron pero no se creó el manifiesto. <b>Abrir</b> para registrarlas,
                o <b>✕</b> en un día para descartarlo si ya lo manejaste (no vuelve a avisar).
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {unregisteredDays.map(d => (
                  <div key={d} className="flex items-stretch rounded-lg overflow-hidden bg-amber-500 text-white">
                    <button onClick={() => setFecha(d)}
                      className="px-2.5 py-1 text-[12px] font-bold hover:bg-amber-400 active:scale-95 transition-all">
                      📅 {d.split('-').reverse().join('/')} — abrir
                    </button>
                    <button onClick={() => dismissUnregisteredDay(d)}
                      title="Descartar este día — no volver a avisar"
                      className="px-2 border-l border-amber-300/70 text-[13px] font-bold leading-none hover:bg-amber-600 active:scale-95 transition-all">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => setUnregisteredDays([])} title="Ocultar por ahora (vuelve a aparecer al recargar)"
              className="text-amber-500 hover:text-amber-700 text-[16px] leading-none flex-shrink-0">✕</button>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-hidden">
        <InputSection
          flota={flota}
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
          onAsignarIA={handleAsignarIA}
          iaLoading={iaLoading}
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
                    pendientesV2={pendientesV2}
                    onCargarPendientes={handleCargarPendientes}
                    onListoPorHoy={handleListoPorHoy}
                    cerrado={cerrado}
                    cerradasV1={cerradasV1}
                    onCerrarCamionV1={cerrarCamionV1}
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
          segundaVueltaContent={
            <div className="h-full overflow-y-auto p-4">
              {pendientesV2Origen.length === 0 ? (
                <div className="bg-kbg border border-black/[0.09] rounded-kios2 px-3 py-4 text-[13px] text-kmuted text-center">
                  No hay pendientes de 2ª vuelta de días anteriores.
                </div>
              ) : (
                <>
                  <div className="mb-3 text-[12px] text-kmuted">
                    <span className="font-semibold text-ktext">{pendientesV2Origen.length}</span> tiendas de días
                    anteriores sin despachar. Asigná un camión y cerralo — se registra como 2ª vuelta (hoy) con su manifiesto.
                  </div>
                  <ManualDispatch
                    calT={calTV2}
                    flota={flota}
                    gps={gps}
                    tiendas={tiendas}
                    cd={cdRef.current}
                    asignaciones={asignacionesV2}
                    onAsignaciones={setAsignacionesV2}
                    onCalcular={() => {}}
                    onCerrarCamion={cerrarCamionV2}
                  />
                </>
              )}
            </div>
          }
        />
      </main>

      {manifiestoV2 && (
        <ManifiestoPanel
          rutas={manifiestoV2}
          fecha={todayStr()}
          supervisor={supervisor}
          tiendas={tiendas as Record<string, TiendaInfo & { _parada?: boolean }>}
          isOpen={true}
          onClose={() => setManifiestoV2(null)}
        />
      )}

      {manifiestoV1 && (
        <ManifiestoPanel
          rutas={manifiestoV1}
          fecha={fecha}
          supervisor={supervisor}
          tiendas={(results?.extTiendas || tiendas) as Record<string, TiendaInfo & { _parada?: boolean }>}
          isOpen={true}
          onClose={() => setManifiestoV1(null)}
        />
      )}

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
