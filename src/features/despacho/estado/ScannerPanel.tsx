'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Scan, X, Check, Layers, Clock, AlertCircle, Zap } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { TIENDAS } from '../regiones/data/tiendas';
import { TIENDAS_SANTIAGO } from '../santiago/data/tiendasSantiago';
import { ALIAS } from '../rutas/data/tiendas';
import { CombineItemsModal } from '../../../components/CombineItemsModal';
import { getOdooConfig } from '../../auditoria/utils/odooApi';
import type { DispatchItem } from '../../../types';
import type { TiendaSantiago, SantiagoItem, SantiagoState } from '../santiago/types';

/* ── Reverse map: regiones tienda code → dispatch key (tienda name in AppContext) ── */
const COD_TO_KEY: Record<string, string> = {};
const COD_TO_TIENDA: Record<string, (typeof TIENDAS)[string]> = {};
Object.entries(TIENDAS).forEach(([key, t]) => {
  COD_TO_KEY[t.cod] = key;
  COD_TO_TIENDA[t.cod] = t;
});

/* ── Reverse map: Santiago tienda code → TiendaSantiago ── */
const SANT_COD_TO_T: Record<string, TiendaSantiago> = {};
TIENDAS_SANTIAGO.forEach(t => { SANT_COD_TO_T[t.cod] = t; });

function loadSantiagoItems(cod: string): SantiagoItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('santiagoState');
    if (!raw) return [];
    const s = JSON.parse(raw) as SantiagoState;
    return s.items?.[cod] ?? [];
  } catch { return []; }
}

const TIPO_LABELS: Record<string, string> = {
  comida: 'Comida',
  hogar: 'Hogar',
  'comida-hogar': 'Mixto',
};

const TIPO_STYLE: Record<string, { bg: string; color: string }> = {
  comida:         { bg: 'rgba(239,68,68,0.1)',   color: '#DC2626' },
  hogar:          { bg: 'rgba(59,130,246,0.1)',  color: '#2563EB' },
  'comida-hogar': { bg: 'rgba(139,92,246,0.1)', color: '#7C3AED' },
};

const STATE_LABELS: Record<string, string> = {
  draft: 'Borrador', waiting: 'Esperando', confirmed: 'Confirmado',
  assigned: 'Listo', done: 'Hecho', cancel: 'Cancelado',
};

function renumber(items: DispatchItem[]): DispatchItem[] {
  let pc = 1, bc = 1;
  return items.map(i => ({ ...i, orden: i.pkg === 'pallet' ? `pallet${pc++}` : `bulto${bc++}` }));
}

/* ── Parse barcode → tienda code + optional pallet number ── */
function parseBarcode(raw: string): { tiendaCod: string | null; palletNum: number | null } {
  const upper = raw.trim().toUpperCase();
  let tiendaCod: string | null = null;
  let palletNum: number | null = null;

  const isKnownCod = (c: string) => !!(COD_TO_KEY[c] || SANT_COD_TO_T[c]);

  // Full string alias/direct match
  const alias = ALIAS[upper];
  if (alias && isKnownCod(alias)) return { tiendaCod: alias, palletNum: null };
  if (isKnownCod(upper)) return { tiendaCod: upper, palletNum: null };

  // Split by common delimiters and scan each part
  const parts = upper.split(/[-|/_\s,;:]+/);
  for (const part of parts) {
    if (!tiendaCod) {
      const r = ALIAS[part] ?? part;
      if (isKnownCod(r)) { tiendaCod = r; continue; }
    }
    // Pallet number: P2, PALLET2
    if (!palletNum) {
      const pm = part.match(/^(?:PALLET|BULTO|P|B)(\d+)$/);
      if (pm) { palletNum = parseInt(pm[1]); continue; }
    }
  }

  // Regex fallback for tienda code
  if (!tiendaCod) {
    const m = upper.match(/\b(\d{1,2}[A-Z]{2,4}\d?)\b/);
    if (m) {
      const c = ALIAS[m[1]] ?? m[1];
      if (isKnownCod(c)) tiendaCod = c;
    }
  }

  // Regex fallback for pallet number
  if (!palletNum) {
    const pm = upper.match(/\bPALLET(\d+)\b|\bBULTO(\d+)\b/);
    if (pm) palletNum = parseInt(pm[1] ?? pm[2]);
  }

  return { tiendaCod, palletNum };
}

/* ── Types ── */
interface ScanResult {
  cod: string;
  key: string;
  source: 'regiones' | 'santiago';
  tienda: (typeof TIENDAS)[string] | TiendaSantiago;
  items: DispatchItem[];       // regiones dispatch items
  santItems?: SantiagoItem[];  // santiago items (read-only, no combine)
  ts: number;
}

interface OdooPickingInfo {
  name: string;
  state: string;
  responsible: string;
  scheduledDate: string;
  origin?: string;
}

/* ════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════ */
export function ScannerPanel() {
  const { state, dispatch: appDispatch } = useApp();

  const [input,       setInput]       = useState('');
  const [result,      setResult]      = useState<ScanResult | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [history,     setHistory]     = useState<ScanResult[]>([]);
  const [selected,    setSelected]    = useState<Set<number>>(new Set());
  const [combineModal,setCombineModal]= useState<{ i1: number; i2: number } | null>(null);

  // Odoo data (non-blocking, optional)
  const [odooPickings, setOdooPickings] = useState<OdooPickingInfo[] | null>(null);
  const [odooLoading,  setOdooLoading]  = useState(false);

  const inputRef       = useRef<HTMLInputElement>(null);
  const resultKeyRef   = useRef<string | null>(null);
  const lastActionRef  = useRef<'scan' | 'tap'>('tap');

  useEffect(() => { inputRef.current?.focus(); }, []);

  /* Keep result items fresh when dispatch changes (regiones only) */
  useEffect(() => {
    if (!resultKeyRef.current) return;
    setResult(prev => prev?.source === 'regiones' ? { ...prev, items: state.dispatch[prev.key] ?? [] } : prev);
    setHistory(prev => prev.map(h => h.source === 'regiones' ? { ...h, items: state.dispatch[h.key] ?? [] } : h));
  }, [state.dispatch]);

  /* Auto-open combine modal when 2 of same type are scan-selected */
  useEffect(() => {
    if (lastActionRef.current !== 'scan') return;
    if (selected.size !== 2 || !result || combineModal) return;
    const [i1, i2] = [...selected];
    const a = result.items[i1], b = result.items[i2];
    if (a && b && a.pkg === b.pkg) setCombineModal({ i1, i2 });
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Fetch Odoo picking data for this tienda code (non-blocking) */
  const fetchOdoo = useCallback(async (tiendaCod: string) => {
    const config = getOdooConfig();
    if (!config) return;
    setOdooLoading(true);
    try {
      const res = await fetch('/api/odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'picking_today_operations', config, query: tiendaCod }),
      });
      const data = await res.json() as { pickings?: OdooPickingInfo[] };
      if (data.pickings?.length) setOdooPickings(data.pickings);
    } catch { /* non-critical */ }
    finally { setOdooLoading(false); }
  }, []);

  /* Process a scanned code (or manual submit) */
  const processCode = useCallback((raw: string) => {
    const code = raw.trim();
    if (!code) return;
    setError(null);

    const { tiendaCod: cod, palletNum } = parseBarcode(code);

    if (!cod) {
      setError(`Sin tienda reconocida en: "${code}"`);
      setResult(null);
      resultKeyRef.current = null;
      setInput('');
      return;
    }

    const isSantiago = !COD_TO_KEY[cod] && !!SANT_COD_TO_T[cod];

    let sr: ScanResult;

    if (isSantiago) {
      const santTienda = SANT_COD_TO_T[cod];
      const santItems  = loadSantiagoItems(cod);
      const key        = `sant:${cod}`;
      const isSame     = resultKeyRef.current === key;
      resultKeyRef.current = key;
      sr = { cod, key, source: 'santiago', tienda: santTienda, items: [], santItems, ts: Date.now() };
      setResult(sr);
      setOdooPickings(null);
      if (!isSame) {
        setHistory(prev => [sr, ...prev.filter(h => h.cod !== cod)].slice(0, 6));
        setSelected(new Set());
      }
    } else {
      const key    = COD_TO_KEY[cod];
      const tienda = COD_TO_TIENDA[cod];
      const items  = state.dispatch[key] ?? [];
      const isSame = resultKeyRef.current === key;
      resultKeyRef.current = key;
      sr = { cod, key, source: 'regiones', tienda, items, ts: Date.now() };
      setResult(sr);
      setOdooPickings(null);

      if (!isSame) {
        setHistory(prev => [sr, ...prev.filter(h => h.cod !== cod)].slice(0, 6));
        setSelected(new Set());
      }

      /* Auto-select pallet by number (scan-to-combine) — only for regiones */
      if (palletNum !== null) {
        lastActionRef.current = 'scan';
        const idx = items.findIndex(i => i.pkg === 'pallet' && i.orden === `pallet${palletNum}`);
        if (idx === -1) {
          const bidx = items.findIndex(i => i.pkg === 'box' && i.orden === `bulto${palletNum}`);
          if (bidx !== -1) setSelected(prev => {
            const next = new Set(prev);
            if (!next.has(bidx) && next.size < 2) next.add(bidx);
            return next;
          });
        } else {
          setSelected(prev => {
            const next = new Set(prev);
            if (!next.has(idx) && next.size < 2) next.add(idx);
            return next;
          });
        }
      } else if (!isSame) {
        lastActionRef.current = 'tap';
      }
    }

    setInput('');
    setTimeout(() => inputRef.current?.focus(), 80);
    fetchOdoo(cod);
  }, [state.dispatch, fetchOdoo]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') processCode(input);
  };

  const toggleSelect = (idx: number) => {
    lastActionRef.current = 'tap';
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) { next.delete(idx); return next; }
      if (next.size >= 2) return prev;
      next.add(idx); return next;
    });
  };

  const handleCombineConfirm = (peso: number, alto: number) => {
    if (!combineModal || !result) return;
    const { i1, i2 } = combineModal;
    const items = result.items;
    const a = items[i1], b = items[i2];
    if (!a || !b) return;

    const merged: DispatchItem = {
      ...a, peso, alto,
      guia:  [a.guia, b.guia].filter(Boolean).join(' · '),
      valor: (a.valor || 0) + (b.valor || 0),
      tipo:  a.tipo === b.tipo ? a.tipo : 'comida-hogar',
    };
    const higher = Math.max(i1, i2), lower = Math.min(i1, i2);
    const newItems = items.filter((_, i) => i !== higher && i !== lower);
    newItems.splice(lower, 0, merged);

    appDispatch({ type: 'UPDATE_ITEMS', tienda: result.key, items: renumber(newItems) });
    setCombineModal(null);
    setSelected(new Set());
    lastActionRef.current = 'tap';
  };

  /* Derived */
  const isSantiagoResult = result?.source === 'santiago';

  // Regiones items
  const currentItems = result?.source === 'regiones' ? (result.items ?? []) : [];
  const pallets      = currentItems.filter(i => i.pkg === 'pallet');
  const bultos       = currentItems.filter(i => i.pkg === 'box');
  const tipoGroups   = currentItems.reduce<Record<string, number>>((acc, i) => {
    acc[i.tipo] = (acc[i.tipo] || 0) + 1; return acc;
  }, {});
  const [selIdx1, selIdx2] = [...selected];
  const canCombine = selected.size === 2 &&
    currentItems[selIdx1]?.pkg === currentItems[selIdx2]?.pkg;

  // Santiago items
  const santItems     = result?.santItems ?? [];
  const santPallets   = santItems.filter(i => i.tipo === 'Pallet');
  const santBultos    = santItems.filter(i => i.tipo === 'Bulto');
  const santContenido = santItems.reduce<Record<string, number>>((acc, i) => {
    acc[i.contenido] = (acc[i.contenido] || 0) + 1; return acc;
  }, {});

  const tiendaName = result
    ? (result.source === 'santiago'
        ? (result.tienda as TiendaSantiago).tienda
        : (result.tienda as (typeof TIENDAS)[string]).name)
    : '';

  const odooConfigured = !!getOdooConfig();

  /* ── RENDER ── */
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg">

      {/* ── Scan input ── */}
      <div className="flex-shrink-0 px-4 py-4 bg-white border-b border-border">
        <div className="relative">
          <Scan size={17} color="#94A3B8" strokeWidth={1.8}
            style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={result ? (isSantiagoResult ? 'Escanea otro código…' : 'Escanea otro pallet para combinar…') : 'Escanea el código del pallet…'}
            className="w-full pl-10 pr-10 py-3 rounded-xl border-2 border-border focus:border-navy focus:outline-none font-mono text-[14px] bg-bg transition-colors"
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          />
          {input && (
            <button onClick={() => { setInput(''); inputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3 hover:text-text cursor-pointer border-none bg-transparent p-1">
              <X size={14} />
            </button>
          )}
        </div>

        {error ? (
          <div className="mt-2 flex items-center gap-1.5 text-[12px] text-red font-semibold">
            <AlertCircle size={12} />{error}
          </div>
        ) : (
          <p className="text-[11px] text-text-3 mt-1.5 pl-0.5">
            {result
              ? (isSantiagoResult
                  ? 'Bodega Santiago — vista solo lectura · escanea otro código para consultar'
                  : 'Escanea un 2° pallet para combinarlo automáticamente · o toca 2 items de la lista')
              : 'Apunta el lector al código — se captura al presionar Enter'}
          </p>
        )}
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Result card */}
        {result ? (
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">

            {/* Tienda header */}
            <div className="px-4 py-3 bg-navy">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-barlow-condensed text-[28px] font-extrabold text-white leading-none tracking-widest">
                    {result.cod}
                  </div>
                  <div className="text-[13px] text-white/70 mt-0.5 font-semibold leading-tight truncate">
                    {tiendaName}
                  </div>
                  {result.tienda.region && (
                    <div className="text-[10px] text-white/35 mt-0.5 uppercase tracking-widest">
                      {result.tienda.region}
                    </div>
                  )}
                </div>
                {/* Odoo indicator */}
                {odooLoading && (
                  <div className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                    <span className="text-[10px] text-white/45 font-bold uppercase">Odoo</span>
                  </div>
                )}
                {!odooLoading && odooPickings && odooPickings.length > 0 && (
                  <div className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.35)' }}>
                    <Zap size={11} color="#10B981" />
                    <span className="text-[10px] text-emerald-300 font-bold uppercase">Odoo {odooPickings.length}op</span>
                  </div>
                )}
                {!odooLoading && !odooPickings && odooConfigured && (
                  <div className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
                    <span className="text-[10px] text-white/30 font-bold uppercase">Sin op hoy</span>
                  </div>
                )}
              </div>
            </div>

            {/* Odoo pickings row */}
            {odooPickings && odooPickings.length > 0 && (
              <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-100">
                <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-1.5">Operaciones Odoo hoy</div>
                <div className="space-y-1">
                  {odooPickings.map((op, i) => (
                    <div key={i} className="text-[11px] space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-emerald-800">{op.name}</span>
                        <span className="px-1.5 py-0.5 rounded-full font-bold" style={{ background: op.state === 'done' ? 'rgba(16,185,129,0.2)' : op.state === 'assigned' ? 'rgba(59,130,246,0.15)' : 'rgba(100,100,100,0.1)', color: op.state === 'done' ? '#059669' : op.state === 'assigned' ? '#2563EB' : '#64748B' }}>
                          {STATE_LABELS[op.state] ?? op.state}
                        </span>
                        {op.responsible && (
                          <span className="text-emerald-600 truncate">{op.responsible}</span>
                        )}
                      </div>
                      {op.origin && (
                        <div className="text-[10px] text-emerald-700 opacity-75 truncate pl-0.5">{op.origin}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isSantiagoResult ? (
              /* ── Santiago body (read-only) ── */
              santItems.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <div className="text-3xl mb-2 opacity-15">📦</div>
                  <p className="text-[13px] text-text-3 font-semibold">Sin despacho registrado hoy</p>
                  <p className="text-[11px] text-text-3 mt-1 opacity-60">Ingresa items en Bodega Santiago</p>
                </div>
              ) : (
                <>
                  {/* P/B counts + contenido badges */}
                  <div className="px-4 py-3 flex items-center gap-5 border-b border-border">
                    {santPallets.length > 0 && (
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-barlow-condensed text-[32px] font-extrabold text-info leading-none">{santPallets.length}</span>
                        <span className="text-[12px] text-text-3 font-semibold">pallet{santPallets.length !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {santBultos.length > 0 && (
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-barlow-condensed text-[32px] font-extrabold text-warn leading-none">{santBultos.length}</span>
                        <span className="text-[12px] text-text-3 font-semibold">bulto{santBultos.length !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    <div className="ml-auto flex gap-1.5 flex-wrap justify-end">
                      {Object.entries(santContenido).map(([cont, cnt]) => {
                        const st = cont === 'Comida' ? { bg: 'rgba(239,68,68,0.1)', color: '#DC2626' }
                          : cont === 'Hogar' ? { bg: 'rgba(59,130,246,0.1)', color: '#2563EB' }
                          : cont === 'Mixto' ? { bg: 'rgba(139,92,246,0.1)', color: '#7C3AED' }
                          : { bg: 'rgba(100,100,100,0.1)', color: '#666' };
                        return (
                          <span key={cont} className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: st.bg, color: st.color }}>
                            {cont} ×{cnt}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Santiago item list (read-only) */}
                  <div className="divide-y divide-border">
                    {santItems.map((item, idx) => {
                      const st = item.contenido === 'Comida' ? { bg: 'rgba(239,68,68,0.1)', color: '#DC2626' }
                        : item.contenido === 'Hogar' ? { bg: 'rgba(59,130,246,0.1)', color: '#2563EB' }
                        : item.contenido === 'Mixto' ? { bg: 'rgba(139,92,246,0.1)', color: '#7C3AED' }
                        : { bg: 'rgba(100,100,100,0.1)', color: '#666' };
                      return (
                        <div key={idx} className="flex items-center gap-3 px-4 py-2.5 select-none">
                          <span className="font-barlow-condensed text-[15px] font-bold text-navy leading-none">{item.orden}</span>
                          <span className="text-[11px] font-semibold text-text-3">{item.tipo}</span>
                          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: st.bg, color: st.color }}>
                            {item.contenido}
                          </span>
                          <span className="text-[12px] text-text-3 ml-auto flex-shrink-0">{item.peso} kg</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Note: combine only available in Bodega Santiago */}
                  <div className="px-4 py-2.5 border-t border-border flex items-center gap-2 bg-bg">
                    <Layers size={11} color="#94A3B8" />
                    <span className="text-[11px] text-text-3">Combinaciones disponibles en Bodega Santiago</span>
                  </div>
                </>
              )
            ) : (
              /* ── Regiones body ── */
              currentItems.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <div className="text-3xl mb-2 opacity-15">📦</div>
                  <p className="text-[13px] text-text-3 font-semibold">Sin despacho registrado hoy</p>
                </div>
              ) : (
                <>
                  {/* Counts + content badges */}
                  <div className="px-4 py-3 flex items-center gap-5 border-b border-border">
                    {pallets.length > 0 && (
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-barlow-condensed text-[32px] font-extrabold text-info leading-none">{pallets.length}</span>
                        <span className="text-[12px] text-text-3 font-semibold">pallet{pallets.length !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {bultos.length > 0 && (
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-barlow-condensed text-[32px] font-extrabold text-warn leading-none">{bultos.length}</span>
                        <span className="text-[12px] text-text-3 font-semibold">bulto{bultos.length !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    <div className="ml-auto flex gap-1.5 flex-wrap justify-end">
                      {Object.entries(tipoGroups).map(([tipo, cnt]) => {
                        const st = TIPO_STYLE[tipo] ?? { bg: 'rgba(100,100,100,0.1)', color: '#666' };
                        return (
                          <span key={tipo} className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: st.bg, color: st.color }}>
                            {TIPO_LABELS[tipo] ?? tipo} ×{cnt}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Combine hint (when nothing selected) */}
                  {selected.size === 0 && currentItems.length >= 2 && (
                    <div className="px-4 py-2 bg-bg border-b border-border flex items-center gap-2">
                      <Layers size={12} color="#94A3B8" />
                      <span className="text-[11px] text-text-3">
                        Escanea otro pallet para combinarlo, o toca 2 de abajo
                      </span>
                    </div>
                  )}

                  {/* Item list */}
                  <div className="divide-y divide-border">
                    {currentItems.map((item, idx) => {
                      const isSel = selected.has(idx);
                      const st = TIPO_STYLE[item.tipo] ?? { bg: 'rgba(100,100,100,0.1)', color: '#666' };
                      return (
                        <div key={idx} onClick={() => toggleSelect(idx)}
                          className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all select-none"
                          style={{ background: isSel ? 'rgba(16,185,129,0.05)' : undefined }}>
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSel ? 'bg-emerald-500 border-emerald-500' : 'border-border'}`}>
                            {isSel && <Check size={11} color="#fff" strokeWidth={3} />}
                          </div>
                          <span className="font-barlow-condensed text-[15px] font-bold text-navy leading-none">{item.orden}</span>
                          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: st.bg, color: st.color }}>
                            {TIPO_LABELS[item.tipo] ?? item.tipo}
                          </span>
                          {item.guia && (
                            <span className="text-[10px] text-text-3 font-mono truncate flex-1 max-w-[100px]">{item.guia}</span>
                          )}
                          <span className="text-[12px] text-text-3 ml-auto flex-shrink-0">{item.peso} kg</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Combine action row */}
                  {currentItems.length >= 2 && (
                    <div className="px-4 py-3 border-t border-border">
                      {selected.size === 0 && null}
                      {selected.size === 1 && (
                        <p className="text-[11px] text-text-3 text-center">
                          Selecciona 1 más del mismo tipo · o escanea el 2° pallet
                        </p>
                      )}
                      {selected.size === 2 && (
                        <button
                          disabled={!canCombine}
                          onClick={() => {
                            if (!canCombine) return;
                            setCombineModal({ i1: selIdx1, i2: selIdx2 });
                          }}
                          className="w-full py-2.5 rounded-xl font-barlow-condensed text-[15px] font-bold tracking-wider cursor-pointer transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                          style={{
                            background: canCombine ? 'rgba(16,185,129,0.12)' : 'rgba(100,100,100,0.06)',
                            color: canCombine ? '#10B981' : '#94A3B8',
                            border: `1.5px solid ${canCombine ? 'rgba(16,185,129,0.30)' : 'rgba(100,100,100,0.15)'}`,
                          }}>
                          <Layers size={14} strokeWidth={2} />
                          {canCombine ? 'Combinar seleccionados' : 'Deben ser del mismo tipo'}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )
            )}
          </div>
        ) : (
          !error && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div style={{ color: '#CBD5E1' }}><Scan size={44} strokeWidth={1.1} /></div>
              <p className="text-[15px] text-text-3 font-semibold mt-4">Escanea el código del pallet</p>
              <p className="text-[12px] text-text-3 mt-1.5 max-w-[240px] leading-relaxed opacity-70">
                El lector escribe el código automáticamente — solo apunta y presiona Enter
              </p>
              {odooConfigured && (
                <div className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.20)' }}>
                  <Zap size={11} color="#10B981" />
                  <span className="text-[11px] font-bold text-emerald-600">Odoo conectado</span>
                </div>
              )}
            </div>
          )
        )}

        {/* Scan history */}
        {history.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Clock size={11} color="#94A3B8" />
              <span className="text-[10px] font-bold text-text-3 uppercase tracking-widest">Recientes</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {history.map(h => {
                const hP = h.source === 'santiago'
                  ? (h.santItems?.filter(i => i.tipo === 'Pallet').length ?? 0)
                  : h.items.filter(i => i.pkg === 'pallet').length;
                const hB = h.source === 'santiago'
                  ? (h.santItems?.filter(i => i.tipo === 'Bulto').length ?? 0)
                  : h.items.filter(i => i.pkg === 'box').length;
                const isActive = result?.cod === h.cod;
                return (
                  <button key={h.cod}
                    onClick={() => {
                      if (h.source === 'santiago') {
                        const freshSant = loadSantiagoItems(h.cod);
                        setResult({ ...h, santItems: freshSant });
                      } else {
                        const current = state.dispatch[h.key] ?? [];
                        setResult({ ...h, items: current });
                      }
                      resultKeyRef.current = h.key;
                      setSelected(new Set());
                      setError(null);
                      setOdooPickings(null);
                      fetchOdoo(h.cod);
                    }}
                    className="px-3 py-1.5 rounded-full border cursor-pointer transition-all font-barlow-condensed text-[13px] font-bold"
                    style={{
                      background: isActive ? 'rgba(27,42,107,0.08)' : '#fff',
                      borderColor: isActive ? 'rgba(27,42,107,0.35)' : '#E2E8F0',
                      color: isActive ? '#1B2A6B' : '#334155',
                    }}>
                    {h.cod}
                    {(hP > 0 || hB > 0) && (
                      <span className="text-text-3 font-normal text-[11px] ml-1.5">
                        {hP > 0 ? `${hP}P` : ''}{hB > 0 ? `${hB}B` : ''}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Combine modal */}
      {combineModal && result && currentItems[combineModal.i1] && currentItems[combineModal.i2] && (
        <CombineItemsModal
          pkgLabel={currentItems[combineModal.i1].pkg === 'pallet' ? 'Pallets' : 'Bultos'}
          srcLabel={`${currentItems[combineModal.i1].orden} · ${TIPO_LABELS[currentItems[combineModal.i1].tipo] ?? ''} · ${currentItems[combineModal.i1].peso} kg`}
          tgtLabel={`${currentItems[combineModal.i2].orden} · ${TIPO_LABELS[currentItems[combineModal.i2].tipo] ?? ''} · ${currentItems[combineModal.i2].peso} kg`}
          mergedGuia={[currentItems[combineModal.i1].guia, currentItems[combineModal.i2].guia].filter(Boolean).join(' · ') || undefined}
          mergedValor={((currentItems[combineModal.i1].valor || 0) + (currentItems[combineModal.i2].valor || 0)) || undefined}
          onConfirm={handleCombineConfirm}
          onCancel={() => { setCombineModal(null); setSelected(new Set()); lastActionRef.current = 'tap'; }}
        />
      )}
    </div>
  );
}
