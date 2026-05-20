'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import Header         from './components/Header';
import InputSection   from './components/InputSection';
import ResultsSection from './components/ResultsSection';
import ConfigPanel    from './components/ConfigPanel';
import ComparisonView from './components/ComparisonView';
import ParadasAdicionales, { type Parada } from './components/ParadasAdicionales';

import { TIENDAS_INICIAL, GPS_INICIAL, CD_INICIAL, SHEETS_WEB_APP_URL } from './data/tiendas';
import { FLOTA_INICIAL } from './data/flota';
import { CAL_INICIAL, DNOM, DCOL } from './data/calendar';
import { getDia, norm, todayStr } from './utils/helpers';
import { asignar, nn } from './utils/routing';
import type { Ruta, StoreItem } from './utils/routing';
import { fetchAuthenticatedSheet, parseTSheetAuth, parseFSheetAuth, parseCalendarioAuth, guardarFlotaFn, guardarHistorialFn, guardarDespachoRMFn } from './utils/sheets';
import { fetchCounts, subscribeToSesion } from '../../../lib/despachoSesion';
import type { SesionRow } from '../../../lib/despachoSesion';
import type { TiendaInfo } from './data/tiendas';
import type { Vehiculo } from './data/flota';

type CalRecord = Record<string, { rm: string[]; costa: string[]; fal: string[] }>;
type CalData   = { on: boolean; p: number; b: number; g?: string };

function mergeCalT(
  newCal: CalRecord,
  fechaStr: string,
  prevCalT: Record<string, CalData>,
  activeGrps: Set<string>
): Record<string, CalData> {
  const dia = getDia(fechaStr);
  const calDia = (newCal[dia] || newCal.LU || {}) as Record<string, string[]>;
  const next: Record<string, CalData> = {};
  ['rm', 'costa', 'fal'].forEach(grp => {
    (calDia[grp] || []).forEach(c => {
      if (c && c.length >= 2) {
        const ex = prevCalT[c];
        next[c] = ex ? { ...ex, g: grp } : { on: activeGrps.has(grp), p: 0, b: 0, g: grp };
      }
    });
  });
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

export default function RutasScreen() {
  const router = useRouter();
  const { signOut } = useAuth();

  const [tiendas, setTiendas] = useState<Record<string, TiendaInfo>>(() => ({ ...TIENDAS_INICIAL }));
  const [gps,     setGps]     = useState<Record<string, number[]>>(() => ({ ...GPS_INICIAL }));
  const cdRef                 = useRef<number[]>([...CD_INICIAL]);
  const [flota,   setFlota]   = useState<Vehiculo[]>(() => FLOTA_INICIAL.map(v => ({ ...v })));
  const [cal,     setCal]     = useState<CalRecord>(() => JSON.parse(JSON.stringify(CAL_INICIAL)));
  const [conductores, setConductores] = useState<string[]>(() =>
    [...new Set(FLOTA_INICIAL.map(v => v.ch).filter((c): c is string => Boolean(c)))]
  );

  const [modo,       setModo]       = useState('cal');
  const [grps,       setGrps]       = useState(new Set(['rm']));
  const [calT,       setCalT]       = useState<Record<string, CalData>>({});
  const [supervisor, setSupervisor] = useState('');
  const [fecha,      setFecha]      = useState(todayStr);
  const [manualText, setManualText] = useState('');
  const setManualTextRef = useRef(setManualText);
  useEffect(() => { setManualTextRef.current = setManualText; }, [setManualText]);
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

  // Chips where the user has manually typed a P/B value — excluded from live sync
  const manuallyEditedRef = useRef<Set<string>>(new Set());

  const sessionRestoredRef = useRef(false);
  const restoringRef       = useRef(false);

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
            newCalT[norm(t.c)] = { on: true, p: t.p, b: t.b, g: 'rm' };
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
              newCalT[norm(t.c)] = { on: true, p: t.p, b: t.b, g: 'rm' };
            });
            setCalT(prev => {
              const merged = { ...prev };
              Object.keys(newCalT).forEach(key => {
                if (!merged[key] || merged[key].p !== newCalT[key].p || merged[key].b !== newCalT[key].b) {
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
          const sc: { date?: string; counts?: Record<string, { p: number; b: number }> } = JSON.parse(rawCounts);
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
                // Skip chips the user has manually edited in this session
                if (merged[c] && !manuallyEditedRef.current.has(c)) {
                  if (merged[c].p !== data.p || merged[c].b !== data.b) {
                    merged[c] = { ...merged[c], p: data.p, b: data.b, on: data.p > 0 || data.b > 0 };
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
          const rc: { date?: string; counts?: Record<string, { p: number; b: number }> } = JSON.parse(rawRegiones);
          const d = new Date();
          const todayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          const counts = (rc.date && rc.date === todayKey) ? (rc.counts ?? null) : null;
          if (counts) {
            setCalT(prev => {
              const merged = { ...prev };
              let changed = false;
              Object.entries(counts).forEach(([cod, data]) => {
                const c = norm(cod);
                if (manuallyEditedRef.current.has(c)) return;
                if (merged[c]) {
                  if (merged[c].p !== data.p || merged[c].b !== data.b) {
                    merged[c] = { ...merged[c], p: data.p, b: data.b, on: data.p > 0 || data.b > 0 };
                    changed = true;
                  }
                } else if (data.p > 0 || data.b > 0) {
                  merged[c] = { on: true, p: data.p, b: data.b, g: 'fal' };
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
          // Inject Regiones stores arriving via Supabase that aren't in the calendar yet
          if (row.fuente === 'regiones' && (row.pallets > 0 || row.bultos > 0)) {
            return { ...prev, [c]: { on: true, p: row.pallets, b: row.bultos, g: 'fal' } };
          }
          return prev;
        }
        if (prev[c].p === row.pallets && prev[c].b === row.bultos) return prev;
        return {
          ...prev,
          [c]: { ...prev[c], p: row.pallets, b: row.bultos, on: row.pallets > 0 || row.bultos > 0 },
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
      const payload: { date?: string; counts?: Record<string, { p: number; b: number }> } = JSON.parse(saved);
      const savedDate = payload.date;
      const session   = payload.counts ?? (payload as Record<string, { p: number; b: number }>);
      // Reject if no date stamp (legacy) or if date doesn't match current session
      if (!savedDate || savedDate !== fecha) return;
      const entries = Object.entries(session).filter(([, d]) => d.p > 0 || d.b > 0);
      if (!entries.length) return;
      restoringRef.current = true;
      setCalT(prev => {
        const merged = { ...prev };
        entries.forEach(([cod, data]) => {
          const c = norm(cod);
          // Only restore counts for stores already in today's calendar — never inject
          // stores from a different day's session into the current day's view.
          if (merged[c]) merged[c] = { ...merged[c], p: data.p, b: data.b, on: true };
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
    const counts: Record<string, { p: number; b: number }> = {};
    Object.entries(calT).forEach(([cod, data]) => {
      if (data.p > 0 || data.b > 0) counts[cod] = { p: data.p, b: data.b };
    });
    localStorage.setItem('despachoCounts', JSON.stringify({ date: fecha, counts }));
  }, [calT, fecha]);

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
        if (!next[t.c]) { next[t.c] = { on: true, p: t.p, b: t.b, g: 'manual' }; changed = true; }
        else if (next[t.c].p !== t.p || next[t.c].b !== t.b) { next[t.c] = { ...next[t.c], on: true, p: t.p, b: t.b }; changed = true; }
      });
      return changed ? next : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualText, modo]);

  // ── Sync calT → manual text ───────────────────────────────────────
  useEffect(() => {
    if (modo !== 'man') return;
    const stores = Object.keys(calT || {}).filter(cod => {
      const grupo = calT[cod]?.g;
      return grupo === 'rm' || grupo === 'costa' || grupo === 'fal';
    });
    if (stores.length === 0) return;
    const newText = stores.map(cod => {
      const data = calT[cod];
      const p = data.p ? `${data.p}P` : '';
      const b = data.b ? `${data.b}B` : '';
      const counts = [p, b].filter(Boolean).join(' ');
      return counts ? `${cod}: ${counts}` : `${cod}:`;
    }).join('\n');
    if (manualText !== newText) setManualTextRef.current(newText);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calT, modo]);

  // ── Init calT from calendar when empty ───────────────────────────
  useEffect(() => {
    if (Object.keys(calT).length > 0) return;
    const dia    = getDia(fecha);
    const calDia = cal[dia] || cal.LU || {};
    const newCalT: Record<string, CalData> = {};
    ['rm','costa','fal'].forEach(grp => {
      ((calDia as Record<string, string[]>)[grp] || []).forEach(c => {
        if (c && c.length >= 2) newCalT[c] = { on: grpsRef.current.has(grp), p: 0, b: 0, g: grp };
      });
    });
    setCalT(newCalT);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, cal]);

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

  function handleUpdateChip(cod: string, key: 'p' | 'b', val: string) {
    manuallyEditedRef.current.add(cod);
    const v = parseInt(val) || 0;
    setCalT(prev => ({ ...prev, [cod]: { ...prev[cod], [key]: v, on: v > 0 ? true : prev[cod].on } }));
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
  }
  function handleAgregarVehiculo(vehiculo: Vehiculo) {
    setFlota(prev => {
      const newFlota = [...prev, vehiculo];
      guardarFlotaFn({
        flota: newFlota, sheetsWebAppUrl: SHEETS_WEB_APP_URL,
        onStart:   () => setFlotaStatus('saving'),
        onSuccess: () => { setFlotaStatus('success'); setTimeout(() => setFlotaStatus('idle'), 3000); },
        onError:   () => { setFlotaStatus('error');   setTimeout(() => setFlotaStatus('idle'), 4000); },
      });
      return newFlota;
    });
  }
  function handleEliminarVehiculo(idx: number) {
    setFlota(prev => {
      const newFlota = prev.filter((_, i) => i !== idx);
      guardarFlotaFn({
        flota: newFlota, sheetsWebAppUrl: SHEETS_WEB_APP_URL,
        onStart:   () => setFlotaStatus('saving'),
        onSuccess: () => { setFlotaStatus('success'); setTimeout(() => setFlotaStatus('idle'), 3000); },
        onError:   () => { setFlotaStatus('error');   setTimeout(() => setFlotaStatus('idle'), 4000); },
      });
      return newFlota;
    });
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
        const tb = ordered.reduce((s, t) => s + t.b, 0);
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
          dest.tp += x.p; dest.tb += x.b;
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
        const newCal = parseCalendarioAuth(t3.values);
        if (newCal) {
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
    guardarFlotaFn({
      flota, sheetsWebAppUrl: SHEETS_WEB_APP_URL,
      onStart:   () => setFlotaStatus('saving'),
      onSuccess: () => { setFlotaStatus('success'); setTimeout(() => setFlotaStatus('idle'), 3000); },
      onError:   () => { setFlotaStatus('error');   setTimeout(() => setFlotaStatus('idle'), 4000); },
    });
  }

  // ── Save history ──────────────────────────────────────────────────
  function handleGuardarHistorial() {
    if (!results) { setHistorialStatus('warn'); setHistorialMsg('⚠️ No hay rutas calculadas.'); return; }
    guardarHistorialFn({
      fecha, supervisor,
      rutas: results.rutas, ts: results.ts,
      gps,
      cd:          cdRef.current,
      kmTotalReal: kmTotalRealRef.current,
      sheetsWebAppUrl: SHEETS_WEB_APP_URL,
      onStart:   () => { setHistorialStatus('loading'); setHistorialMsg(''); },
      onSuccess: msg => { setHistorialMsg(msg); setHistorialStatus('success'); },
      onWarn:    msg => { setHistorialMsg(msg); setHistorialStatus('warn'); },
      onError:   msg => { setHistorialMsg(msg); setHistorialStatus('error'); },
    });
    guardarDespachoRMFn({ fecha, supervisor, rutas: results.rutas, tiendas });

    // Mark all dispatched stores as En camino in Supabase
    const cods = [...new Set(results.rutas.flatMap(r => r.ts.map(t => t.c)))];
    cods.forEach(cod => {
      fetch('/api/seguimiento', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cod, estado: 'En camino' }),
      }).catch(() => {});
    });
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
    <div className="h-screen overflow-y-auto bg-kbg font-sans text-ktext" style={{ paddingBottom: '60px' }}>
      <Header
        updateStatus={updateStatus}
        tiendas={tiendas}
        onUpdate={handleActualizarDatos}
        onOpenConfig={handleOpenConfig}
        flotaStatus={flotaStatus}
        onGuardarFlota={handleGuardarFlota}
        onBack={() => {
          const from = sessionStorage.getItem('despacho_from');
          sessionStorage.removeItem('despacho_from');
          router.push(from || '/despacho/santiago');
        }}
        onSignOut={async () => { await signOut(); router.push('/login'); }}
        flota={flota}
        conductores={conductores}
        onToggleFlota={handleToggleFlota}
        onToggleTlbd={handleToggleTlbd}
        onConductorChange={handleConductorChange}
        onAgregarConductor={handleAgregarConductor}
        onAgregarVehiculo={handleAgregarVehiculo}
        onEliminarVehiculo={handleEliminarVehiculo}
      />

      <main className="max-w-[700px] mx-auto px-3.5 py-5">
        {!results ? (
          comparisonData ? (
            <ComparisonView
              data={comparisonData}
              gps={comparisonData.extGps || gps}
              cd={cdRef.current}
              tiendas={(comparisonData.extTiendas || tiendas) as Record<string, TiendaInfo>}
              onUsar={handleUsarRuta}
              onVolver={handleVolverEditar}
            />
          ) : (
            <InputSection
              flota={flota} conductores={conductores}
              modo={modo} grps={grps} calT={calT}
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
              onConductorChange={handleConductorChange}
              onAgregarConductor={handleAgregarConductor}
              onSupervisor={setSupervisor}
              onFecha={setFecha}
              onManual={setManualText}
              onAsignaciones={setManualAsignaciones}
              onCalcular={handleCalcular}
              onCalcularManual={handleCalcularManual}
              onLimpiar={handleLimpiar}
              onEliminarParada={handleEliminarParada}
            />
          )
        ) : (
          <ResultsSection
            results={results}
            supervisor={supervisor}
            fecha={fecha}
            tiendas={(results.extTiendas || tiendas) as Parameters<typeof ResultsSection>[0]['tiendas']}
            gps={results.extGps || gps}
            cd={cdRef.current}
            flota={flota}
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
        )}
      </main>

      <footer className="no-print border-t border-black/[0.09] mt-9 py-[18px] text-center text-[11px] text-kmuted font-mono">
        KiosClub · Centro de Distribución · Sistema de Enrutamiento v4.3 · {Object.keys(tiendas).length} tiendas
      </footer>

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
