'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { getOdooConfig } from '@/features/auditoria/utils/odooApi';
import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PickingOperation {
  id: number;
  name: string;
  origin: string;
  partner: string;
  fromLocation: string;
  toLocation: string;
  state: string;
  scheduledDate: string;
  dateDone: string | null;
  pickingType: string;
  responsible: string;
  responsibleId: number | null;
  categories: string[];
  storeCodeFromOrigin: string;
  originDate: string;
}

interface PickerGroup {
  key: string;
  operations: PickingOperation[];
}

// 'search' = left panel visible on mobile; 'planilla' = right panel on mobile
type View = 'search' | 'planilla' | 'barcode';

interface OdooConfig { url: string; db: string; username: string; apiKey: string; }

const SAVED_NAMES_KEY = 'picking_saved_picker_names';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATE_INFO: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:     { label: 'Borrador',   color: '#6B7280', bg: 'rgba(107,114,128,0.10)', border: 'rgba(107,114,128,0.25)' },
  waiting:   { label: 'Esperando', color: '#D97706', bg: 'rgba(217,119,6,0.10)',   border: 'rgba(217,119,6,0.30)' },
  confirmed: { label: 'Confirmado', color: '#2563EB', bg: 'rgba(37,99,235,0.10)',  border: 'rgba(37,99,235,0.30)' },
  assigned:  { label: 'Listo',      color: '#16A34A', bg: 'rgba(22,163,74,0.10)',  border: 'rgba(22,163,74,0.30)' },
  done:      { label: 'Realizado',  color: '#16A34A', bg: 'rgba(22,163,74,0.15)',  border: 'rgba(22,163,74,0.40)' },
  cancel:    { label: 'Cancelado',  color: '#DC2626', bg: 'rgba(220,38,38,0.10)',  border: 'rgba(220,38,38,0.30)' },
};

function parseOrigin(origin: string): { categories: string[]; storeCode: string; originDate: string } {
  const categories: string[] = [];
  const catMatch = origin.match(/\(([^)]+)\)/);
  if (catMatch) catMatch[1].split(',').forEach(c => { const t = c.trim(); if (t) categories.push(t); });
  const storeMatch = origin.match(/\b(\d{2}[A-Z]{2,4})\b/);
  const dateMatch = origin.match(/Fecha\((\d{2}\/\d{2}\/\d{4})\)/) ?? origin.match(/(\d{2}\/\d{2}\/\d{4})/);
  return { categories, storeCode: storeMatch?.[1] ?? '', originDate: dateMatch?.[1] ?? '' };
}

function getStoreName(cod: string): string {
  return TIENDAS_INICIAL[cod]?.n ?? cod;
}

// Take only the last segment of an Odoo location path (e.g. "WH/Picking Zone" → "Picking Zone")
function shortLoc(loc: string): string {
  if (!loc) return '';
  return loc.split('/').pop()?.trim() ?? loc;
}

function StateBadge({ state }: { state: string }) {
  const info = STATE_INFO[state] ?? { label: state, color: '#6B7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.25)' };
  return (
    <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
      style={{ color: info.color, background: info.bg, border: `1px solid ${info.border}` }}>
      {state === 'done' ? '✓ ' : ''}{info.label}
    </span>
  );
}

// ─── 1D Barcode (Code128 via JsBarcode) ──────────────────────────────────────

function Barcode1D({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!svgRef.current || !value) return;
    import('jsbarcode').then(({ default: JsBarcode }) => {
      if (!svgRef.current) return;
      try {
        JsBarcode(svgRef.current, value, { format: 'CODE128', width: 2.5, height: 80, displayValue: false, margin: 12, background: '#ffffff', lineColor: '#000000' });
      } catch {
        const safe = value.replace(/[^\x20-\x7E]/g, '');
        try { JsBarcode(svgRef.current!, safe, { format: 'CODE128', width: 2.5, height: 80, displayValue: false, margin: 12 }); }
        catch { /* ignore */ }
      }
    });
  }, [value]);
  return <svg ref={svgRef} className="w-full" />;
}

// ─── Barcode Sheet ─────────────────────────────────────────────────────────────

function BarcodeSheet({ group, storeCode, displayName, pallets, onBack }: {
  group: PickerGroup; storeCode: string; displayName: string; pallets: number; onBack: () => void;
}) {
  const copies = Math.max(1, pallets);
  const storeName = getStoreName(storeCode);
  const refs = group.operations.map(o => o.name).join('+');
  const pickerLabel = displayName || group.key;
  const allCategories = [...new Set(group.operations.flatMap(o => o.categories))];
  const todayStr = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      <div className="print:hidden flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #78350F 0%, #D97706 100%)', boxShadow: '0 2px 16px rgba(217,119,6,0.35)' }}>
        <button onClick={onBack} className="border-none bg-white/15 text-white text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full">← Volver</button>
        <div className="flex-1 min-w-0">
          <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase">
            {copies} Código{copies !== 1 ? 's' : ''} de Barra
          </div>
          <div className="text-[11px] text-white/60 uppercase tracking-widest truncate">
            {pickerLabel} · {storeCode} {storeName} · {todayStr}
          </div>
        </div>
        <button onClick={() => window.print()}
          className="border-none bg-white/20 text-white font-bold text-[13px] cursor-pointer px-4 py-2 rounded-full">
          🖨 Imprimir
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-10 max-w-lg mx-auto w-full">
        <p className="print:hidden text-[12px] text-text-3 mt-4 mb-3 text-center">
          {copies} copia{copies !== 1 ? 's' : ''} · Una por pallet · Usa <strong>Imprimir</strong> para obtener las etiquetas
        </p>

        {Array.from({ length: copies }, (_, i) => {
          const barcodeValue = `${storeCode}|${refs}|P${i + 1}`;
          return (
            <div key={i} className="bg-white border border-border rounded-card mb-4 p-5 print:mb-0 print:border-0 print:rounded-none"
              style={{ boxShadow: '0 1px 10px rgba(26,37,80,0.07)', pageBreakAfter: 'always' }}>
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <div className="font-barlow-condensed text-[18px] font-bold text-navy uppercase tracking-wide leading-tight">{storeCode} — {storeName}</div>
                  <div className="text-[12px] text-text-2 font-semibold mt-0.5">{pickerLabel}</div>
                </div>
                <div className="text-right ml-3 shrink-0">
                  <div className="font-barlow-condensed text-[28px] font-bold text-amber-600 leading-none">{i + 1}</div>
                  <div className="text-[10px] text-text-3 uppercase">de {copies}</div>
                </div>
              </div>
              <div className="border border-gray-100 rounded-lg p-2 bg-white">
                <Barcode1D value={barcodeValue} />
                <div className="text-center text-[10px] font-mono text-text-3 mt-1 select-all break-all">{barcodeValue}</div>
              </div>
              <div className="mt-3 pt-2 border-t border-dashed border-border space-y-1.5">
                {group.operations.map(op => (
                  <div key={op.id} className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono font-bold text-navy shrink-0">{op.name}</span>
                    <span className="text-text-3 truncate">{op.categories.join(', ') || op.origin}</span>
                    <StateBadge state={op.state} />
                  </div>
                ))}
                {allCategories.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {allCategories.map(c => (
                      <span key={c} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(26,37,80,0.07)] text-navy">{c}</span>
                    ))}
                  </div>
                )}
                <div className="text-[10px] text-text-3">{todayStr}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Picker Group Card ────────────────────────────────────────────────────────

function PickerGroupCard({ group, displayName, pallets, onNameChange, onPalletsChange, onGenerateCodes, onRefreshOp, refreshingId }: {
  group: PickerGroup; displayName: string; pallets: number;
  onNameChange: (v: string) => void; onPalletsChange: (n: number) => void;
  onGenerateCodes: () => void; onRefreshOp: (op: PickingOperation) => void; refreshingId: number | null;
}) {
  const allDone = group.operations.every(o => o.state === 'done');
  const allCategories = [...new Set(group.operations.flatMap(o => o.categories))];

  return (
    <div className="bg-white border rounded-card overflow-hidden"
      style={{
        borderColor: allDone ? 'rgba(22,163,74,0.35)' : 'rgba(26,37,80,0.10)',
        boxShadow: allDone ? '0 2px 12px rgba(22,163,74,0.10)' : '0 1px 6px rgba(26,37,80,0.06)',
      }}>

      {/* Group header */}
      <div className="px-4 py-3 border-b"
        style={{ background: allDone ? 'rgba(22,163,74,0.05)' : 'rgba(26,37,80,0.02)', borderColor: allDone ? 'rgba(22,163,74,0.15)' : '#F0F2F5' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-[12px] font-bold text-navy bg-[rgba(26,37,80,0.08)] px-2.5 py-1 rounded shrink-0">{group.key}</span>
            {displayName && <span className="text-[13px] font-semibold text-text truncate">{displayName}</span>}
            {allDone && <span className="text-[11px] font-bold text-[#16A34A] shrink-0">✓ Todo realizado</span>}
          </div>
          <span className="text-[12px] text-text-3 shrink-0">{group.operations.length} op.</span>
        </div>
        {allCategories.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {allCategories.map(c => (
              <span key={c} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[rgba(26,37,80,0.07)] text-navy">{c}</span>
            ))}
          </div>
        )}
      </div>

      {/* Operations list */}
      <div className="px-4 pt-3 space-y-2">
        {group.operations.map(op => {
          const from = shortLoc(op.fromLocation);
          const to   = shortLoc(op.toLocation) || op.storeCodeFromOrigin;
          return (
            <div key={op.id} className="flex items-start gap-2 pb-2 border-b border-dashed border-border last:border-b-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[12px] font-bold text-navy">{op.name}</span>
                  <StateBadge state={op.state} />
                </div>
                {op.categories.length > 0 && (
                  <div className="text-[11px] text-text-3 mt-0.5">{op.categories.join(' · ')}</div>
                )}
                {/* De → A: short location names only */}
                {(from || to) && (
                  <div className="text-[11px] text-text-3 mt-0.5 flex items-center gap-1">
                    {from && <><span className="font-semibold text-text-2">De:</span> {from}</>}
                    {from && to && <span className="text-text-3 mx-0.5">→</span>}
                    {to && <><span className="font-semibold text-text-2">A:</span> <span className="font-semibold text-navy">{to}</span></>}
                  </div>
                )}
              </div>
              {op.state !== 'done' && (
                <button onClick={() => onRefreshOp(op)} disabled={refreshingId === op.id} title="Verificar estado en Odoo"
                  className="text-[11px] shrink-0 border rounded-full px-2 py-1 cursor-pointer disabled:opacity-40"
                  style={{ borderColor: 'rgba(37,99,235,0.35)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                  {refreshingId === op.id ? '⏳' : '↻'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Name + pallets */}
      <div className="px-4 py-4 space-y-3">
        <div>
          <label className="text-[10px] font-bold text-text-3 uppercase tracking-wide block mb-1">Nombre del picker</label>
          <input type="text" value={displayName} onChange={e => onNameChange(e.target.value)}
            placeholder={`Nombre real para ${group.key}…`}
            className="w-full border border-border rounded-card px-3 py-2.5 text-[14px] font-barlow text-text bg-white outline-none focus:border-amber-400 transition-colors" />
        </div>

        <div>
          <label className="text-[10px] font-bold text-text-3 uppercase tracking-wide block mb-1">Cantidad de pallets</label>
          <div className="flex items-center gap-3">
            <button onClick={() => onPalletsChange(Math.max(0, pallets - 1))}
              className="w-10 h-10 rounded-full border border-border font-bold text-[20px] text-text-2 cursor-pointer bg-bg hover:bg-border flex items-center justify-center transition-colors">−</button>
            <input type="number" min={0} value={pallets === 0 ? '' : pallets}
              onChange={e => onPalletsChange(Math.max(0, parseInt(e.target.value) || 0))}
              placeholder="0"
              className="flex-1 border border-border rounded-card px-3 py-2.5 text-[22px] font-barlow-condensed font-bold text-center text-navy bg-white outline-none focus:border-amber-400 transition-colors" />
            <button onClick={() => onPalletsChange(pallets + 1)}
              className="w-10 h-10 rounded-full border border-border font-bold text-[20px] text-text-2 cursor-pointer bg-bg hover:bg-border flex items-center justify-center transition-colors">+</button>
          </div>
        </div>

        <button onClick={onGenerateCodes} disabled={pallets === 0}
          className="w-full py-3 rounded-card font-barlow-condensed text-[16px] font-bold text-white cursor-pointer disabled:opacity-40 transition-all active:scale-95"
          style={{ background: pallets > 0 ? 'linear-gradient(135deg, #78350F, #D97706)' : 'rgba(107,114,128,0.3)' }}>
          {pallets === 0 ? 'Ingresa la cantidad de pallets' : `Generar ${pallets} código${pallets !== 1 ? 's' : ''} de barra`}
        </button>
      </div>
    </div>
  );
}

// ─── Left Panel: Store List ───────────────────────────────────────────────────

function StoreListPanel({ storeCod, loading, pickerGroupsCount, onSelectStore }: {
  storeCod: string; loading: boolean; pickerGroupsCount: number;
  onSelectStore: (cod: string) => void;
}) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const up = q.trim().toUpperCase();
    if (!up) return Object.entries(TIENDAS_INICIAL);
    return Object.entries(TIENDAS_INICIAL).filter(([cod, info]) =>
      cod.includes(up) || info.n.toUpperCase().includes(up)
    );
  }, [q]);

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Panel header */}
      <div className="px-3 pt-4 pb-3 border-b border-border flex-shrink-0">
        <div className="font-barlow-condensed text-[13px] font-bold text-navy uppercase tracking-widest mb-2 flex items-center gap-2">
          Tiendas
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[rgba(26,37,80,0.07)] text-text-3 uppercase tracking-wide normal-case">
            Hoy
          </span>
        </div>
        {/* Search */}
        <div className="flex items-center gap-2 bg-[#F5F6FA] border border-border rounded-card px-3 py-2">
          <svg className="w-3.5 h-3.5 text-text-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input type="text" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar tienda…"
            className="flex-1 bg-transparent border-none outline-none text-[13px] font-barlow text-text min-w-0" />
          {q && (
            <button onClick={() => setQ('')} className="text-text-3 border-none bg-transparent cursor-pointer text-[16px] leading-none shrink-0">×</button>
          )}
        </div>
      </div>

      {/* Store list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map(([cod, info]) => {
          const isSelected = cod === storeCod;
          const isLoading  = isSelected && loading;
          return (
            <button key={cod} onClick={() => onSelectStore(cod)} disabled={isLoading}
              className="w-full flex items-center gap-2 px-3 py-2.5 border-b border-border last:border-b-0 cursor-pointer text-left transition-all hover:bg-[rgba(217,119,6,0.04)] disabled:cursor-wait"
              style={{
                background: isSelected ? 'rgba(217,119,6,0.08)' : undefined,
                borderLeft: `3px solid ${isSelected ? '#D97706' : 'transparent'}`,
              }}>
              <span className="font-mono text-[11px] font-bold shrink-0 px-1.5 py-0.5 rounded"
                style={{
                  background: isSelected ? 'rgba(217,119,6,0.15)' : 'rgba(26,37,80,0.07)',
                  color: isSelected ? '#D97706' : '#374151',
                }}>
                {cod}
              </span>
              <span className="text-[12px] truncate flex-1"
                style={{ color: isSelected ? '#D97706' : '#374151', fontWeight: isSelected ? 600 : 400 }}>
                {info.n}
              </span>
              {isLoading && <span className="text-[12px] shrink-0 animate-spin">⏳</span>}
              {isSelected && !isLoading && pickerGroupsCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ background: 'rgba(217,119,6,0.18)', color: '#D97706' }}>
                  {pickerGroupsCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function PickingScreen() {
  const router = useRouter();
  const { profile, signOut } = useAuth();

  const odooConfig: OdooConfig = getOdooConfig() ?? { url: '', db: '', username: '', apiKey: '' };
  const hasOdoo = !!odooConfig.url;

  const [view, setView] = useState<View>('search');
  const [storeCod, setStoreCod] = useState('');

  const [operations, setOperations] = useState<PickingOperation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const [pickerDisplayNames, setPickerDisplayNames] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(SAVED_NAMES_KEY) ?? '{}') as Record<string, string>; }
    catch { return {}; }
  });
  const [pickerPallets, setPickerPallets] = useState<Record<string, number>>({});
  const [barcodeGroup, setBarcodeGroup] = useState<PickerGroup | null>(null);

  useEffect(() => {
    localStorage.setItem(SAVED_NAMES_KEY, JSON.stringify(pickerDisplayNames));
  }, [pickerDisplayNames]);

  const pickerGroups = useMemo((): PickerGroup[] => {
    const map: Record<string, PickingOperation[]> = {};
    for (const op of operations) {
      const key = op.responsible || 'Sin asignar';
      if (!map[key]) map[key] = [];
      map[key].push(op);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([key, ops]) => ({ key, operations: ops }));
  }, [operations]);

  const fetchOperations = useCallback(async (cod: string) => {
    if (!hasOdoo) { setError('Odoo no configurado.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'picking_today_operations', config: odooConfig, query: cod }),
      });
      const data = (await res.json()) as {
        pickings?: Array<{
          id: number; name: string; origin: string; partner: string;
          fromLocation: string; toLocation: string; state: string;
          scheduledDate: string; dateDone: string | null; pickingType: string;
          responsible: string; responsibleId: number | null;
        }>;
        error?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Error Odoo');
      const parsed: PickingOperation[] = (data.pickings ?? []).map(p => {
        const { categories, storeCode, originDate } = parseOrigin(p.origin);
        return { ...p, categories, storeCodeFromOrigin: storeCode, originDate };
      });
      setOperations(parsed);
      setLastRefresh(new Date());
      setView('planilla');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [hasOdoo, odooConfig]);

  const handleSelectStore = useCallback((cod: string) => {
    setStoreCod(cod);
    void fetchOperations(cod);
  }, [fetchOperations]);

  const refreshOp = useCallback(async (op: PickingOperation) => {
    if (!hasOdoo) return;
    setRefreshingId(op.id);
    try {
      const res = await fetch('/api/odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'picking_check_state', config: odooConfig, query: op.name }),
      });
      const data = (await res.json()) as { state?: string; dateDone?: string | null };
      if (res.ok && data.state) {
        setOperations(prev => prev.map(o =>
          o.id === op.id ? { ...o, state: data.state!, dateDone: data.dateDone ?? o.dateDone } : o
        ));
      }
    } catch { /* silent */ }
    setRefreshingId(null);
  }, [hasOdoo, odooConfig]);

  // ── Barcode sheet: full-screen takeover ──
  if (view === 'barcode' && barcodeGroup) {
    return (
      <BarcodeSheet
        group={barcodeGroup}
        storeCode={storeCod}
        displayName={pickerDisplayNames[barcodeGroup.key] ?? ''}
        pallets={pickerPallets[barcodeGroup.key] ?? 1}
        onBack={() => { setView('planilla'); setBarcodeGroup(null); }}
      />
    );
  }

  const todayLabel = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#F5F6FA]">

      {/* ── Header (full width) ── */}
      <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #78350F 0%, #D97706 100%)', boxShadow: '0 2px 16px rgba(217,119,6,0.35)' }}>

        {/* Mobile: context-aware back */}
        <button
          className="lg:hidden border-none bg-white/15 text-white text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full"
          onClick={() => view === 'planilla' ? setView('search') : router.push('/')}>
          {view === 'planilla' ? '← Tiendas' : '← Inicio'}
        </button>
        {/* Desktop: always Inicio */}
        <button
          className="hidden lg:inline-flex border-none bg-white/15 text-white text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full"
          onClick={() => router.push('/')}>
          ← Inicio
        </button>

        <div className="flex-1 min-w-0">
          <div className="font-barlow-condensed text-[22px] font-bold text-white tracking-widest uppercase leading-tight">
            Picking
          </div>
          <div className="text-[11px] text-white/50 uppercase tracking-widest truncate">
            {storeCod
              ? `${storeCod} · ${getStoreName(storeCod)} · ${todayLabel}`
              : `Supervisión · ${profile?.full_name ?? ''}`}
          </div>
        </div>

        <button onClick={() => router.push('/perfil')}
          className="border-none bg-white/12 text-white/80 text-[12px] cursor-pointer px-3 py-1.5 rounded-full shrink-0">👤</button>
        <button onClick={async () => { await signOut(); router.push('/login'); }}
          className="border-none bg-white/10 text-white/70 text-[12px] cursor-pointer font-barlow px-3 py-1.5 rounded-full shrink-0">Salir</button>
      </div>

      {/* ── Split body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT PANEL: store list ──
            Mobile: shown when view='search', hidden when view='planilla'
            Desktop: always shown (lg:flex) */}
        <div className={[
          'flex flex-col bg-white border-r border-border shrink-0 overflow-hidden',
          'w-full lg:w-72 xl:w-80',
          view === 'planilla' ? 'hidden lg:flex' : 'flex',
        ].join(' ')}>
          <StoreListPanel
            storeCod={storeCod}
            loading={loading}
            pickerGroupsCount={pickerGroups.length}
            onSelectStore={handleSelectStore}
          />
        </div>

        {/* ── RIGHT PANEL: planilla ──
            Mobile: shown when view='planilla', hidden when view='search'
            Desktop: always shown (lg:flex) */}
        <div className={[
          'flex flex-col flex-1 overflow-hidden',
          view === 'search' ? 'hidden lg:flex' : 'flex',
        ].join(' ')}>

          {/* Desktop empty state — no store selected yet */}
          {view === 'search' && (
            <div className="m-auto text-center px-8 py-12">
              <div className="text-[52px] mb-4">🏪</div>
              <div className="font-barlow-condensed text-[22px] font-bold text-text-2 mb-2">Selecciona una tienda</div>
              <div className="text-[13px] text-text-3 max-w-xs mx-auto">
                Elige una tienda del panel izquierdo para ver las operaciones de picking programadas para hoy.
              </div>
              {!hasOdoo && (
                <div className="mt-6 bg-white border border-[rgba(220,38,38,0.25)] rounded-card px-4 py-3 text-[12px] text-red text-left inline-block">
                  <span className="font-bold">Odoo no configurado.</span><br />
                  <code className="text-[11px]">NEXT_PUBLIC_ODOO_URL · DB · USERNAME · API_KEY</code>
                </div>
              )}
            </div>
          )}

          {/* Planilla content */}
          {view === 'planilla' && (
            <div className="flex-1 overflow-y-auto px-4 pb-10">

              {/* Summary bar */}
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-semibold text-text-2">
                    {pickerGroups.length === 0
                      ? 'Sin operaciones hoy'
                      : `${pickerGroups.length} picker${pickerGroups.length !== 1 ? 's' : ''} · ${operations.length} operaciones`}
                  </div>
                  {lastRefresh && (
                    <div className="text-[11px] text-text-3">
                      Actualizado: {lastRefresh.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
                <button onClick={() => { void fetchOperations(storeCod); }} disabled={loading}
                  className="text-[12px] font-semibold cursor-pointer border rounded-full px-3 py-1.5 transition-all disabled:opacity-40"
                  style={{ borderColor: 'rgba(217,119,6,0.4)', color: '#D97706', background: 'rgba(217,119,6,0.06)' }}>
                  {loading ? '⏳' : '↻ Actualizar'}
                </button>
              </div>

              {error && (
                <div className="mt-2 text-[12px] text-red bg-white border border-[rgba(220,38,38,0.2)] rounded-card px-4 py-2">{error}</div>
              )}

              {/* Empty planilla */}
              {pickerGroups.length === 0 && !loading && (
                <div className="mt-8 text-center">
                  <div className="text-[40px] mb-3">📦</div>
                  <div className="font-barlow-condensed text-[18px] font-bold text-text-2">Sin operaciones para hoy</div>
                  <div className="text-[13px] text-text-3 mt-1">
                    No hay operaciones de picking {storeCod ? `para tienda ${storeCod}` : 'programadas para hoy'} en Odoo.
                  </div>
                </div>
              )}

              {/* Picker group cards */}
              <div className="mt-4 space-y-4">
                {pickerGroups.map(group => (
                  <PickerGroupCard
                    key={group.key}
                    group={group}
                    displayName={pickerDisplayNames[group.key] ?? ''}
                    pallets={pickerPallets[group.key] ?? 0}
                    onNameChange={name => setPickerDisplayNames(prev => ({ ...prev, [group.key]: name }))}
                    onPalletsChange={n => setPickerPallets(prev => ({ ...prev, [group.key]: n }))}
                    onGenerateCodes={() => { setBarcodeGroup(group); setView('barcode'); }}
                    onRefreshOp={refreshOp}
                    refreshingId={refreshingId}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
