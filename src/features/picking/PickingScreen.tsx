'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { getOdooConfig } from '@/features/auditoria/utils/odooApi';
import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';
import { fetchCalendarioCompleto } from '@/features/despacho/utils/useCalendario';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PickingOperation {
  id: number; name: string; origin: string; partner: string;
  fromLocation: string; toLocation: string; state: string;
  scheduledDate: string; dateDone: string | null; pickingType: string;
  responsible: string; responsibleId: number | null;
  categories: string[]; storeCodeFromOrigin: string; originDate: string;
}
interface PickerGroup { key: string; storeCod: string; stateKey: string; operations: PickingOperation[]; }
interface TodayStore { cod: string; name: string; sources: ('rm' | 'regiones')[]; }
type StoreGroupKey = 'region' | 'costa' | 'santiago';
interface OdooConfig { url: string; db: string; username: string; apiKey: string; }

interface PickingSession {
  date: string;
  selectedCods: string[];
  opsMap: Record<string, PickingOperation[]>;
  pickerPallets: Record<string, number>;
  pickerDisplayNames: Record<string, string>;
}

const SAVED_NAMES_KEY   = 'picking_saved_picker_names';
const SESSION_KEY       = 'picking_session_v1';
const AUTO_REFRESH_MS   = 3 * 60 * 1000; // 3 min

// ─── Constants ────────────────────────────────────────────────────────────────

// Chocolate excluido por ahora
const ABAST_KEYWORDS = [
  { kw: 'Abastecimiento Comida', cat: 'Comida' },
  { kw: 'Abastecimiento Aseo',   cat: 'Aseo' },
  { kw: 'Abastecimiento Hogar',  cat: 'Hogar' },
] as const;

const STATE_INFO: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:     { label: 'Borrador',   color: '#6B7280', bg: 'rgba(107,114,128,0.10)', border: 'rgba(107,114,128,0.25)' },
  waiting:   { label: 'Esperando', color: '#D97706', bg: 'rgba(217,119,6,0.10)',   border: 'rgba(217,119,6,0.30)' },
  confirmed: { label: 'Confirmado', color: '#2563EB', bg: 'rgba(37,99,235,0.10)',  border: 'rgba(37,99,235,0.30)' },
  assigned:  { label: 'Listo',      color: '#16A34A', bg: 'rgba(22,163,74,0.10)',  border: 'rgba(22,163,74,0.30)' },
  done:      { label: 'Realizado',  color: '#16A34A', bg: 'rgba(22,163,74,0.15)',  border: 'rgba(22,163,74,0.40)' },
  cancel:    { label: 'Cancelado',  color: '#DC2626', bg: 'rgba(220,38,38,0.10)',  border: 'rgba(220,38,38,0.30)' },
};

const GROUP_LABELS: Record<StoreGroupKey, string> = { region: 'Regiones', costa: 'Costa', santiago: 'Santiago' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseOrigin(origin: string): { categories: string[]; storeCode: string; originDate: string } {
  const categories: string[] = ABAST_KEYWORDS
    .filter(({ kw }) => origin.includes(kw))
    .map(({ cat }) => cat as string);
  if (categories.length === 0) {
    const m = origin.match(/\(([^)]+)\)/);
    if (m) m[1].split(',').forEach(c => { const t = c.trim(); if (t) categories.push(t); });
  }
  const storeMatch = origin.match(/\b(\d{2}[A-Z]{2,4})\b/);
  const dateMatch  = origin.match(/Fecha\((\d{2}\/\d{2}\/\d{4})\)/) ?? origin.match(/(\d{2}\/\d{2}\/\d{4})/);
  return { categories, storeCode: storeMatch?.[1] ?? '', originDate: dateMatch?.[1] ?? '' };
}

function isAbastecimientoOp(origin: string): boolean {
  return ABAST_KEYWORDS.some(({ kw }) => origin.includes(kw));
}

function getStoreName(cod: string): string { return TIENDAS_INICIAL[cod]?.n ?? cod; }

function getStoreGroup(store: TodayStore): StoreGroupKey {
  const z = TIENDAS_INICIAL[store.cod]?.z ?? '';
  if (z === 'Región' || store.sources.includes('regiones')) return 'region';
  if (z === 'Costa') return 'costa';
  return 'santiago';
}

// Sanitiza texto para CODE128 (solo ASCII 32-127, sin tildes)
function sanitizeForBarcode(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

function todayISO(): string { return new Date().toISOString().slice(0, 10); }

function StateBadge({ state }: { state: string }) {
  const info = STATE_INFO[state] ?? { label: state, color: '#6B7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.25)' };
  return (
    <span className="inline-flex items-center text-[12px] font-bold px-2.5 py-0.5 rounded-full shrink-0"
      style={{ color: info.color, background: info.bg, border: `1px solid ${info.border}` }}>
      {state === 'done' ? '✓ ' : ''}{info.label}
    </span>
  );
}

// ─── 1D Barcode ───────────────────────────────────────────────────────────────

function Barcode1D({ value, height = 72 }: { value: string; height?: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!svgRef.current || !value) return;
    import('jsbarcode').then(({ default: JsBarcode }) => {
      if (!svgRef.current) return;
      try {
        JsBarcode(svgRef.current, value, { format: 'CODE128', width: 2, height, displayValue: false, margin: 6, background: '#ffffff', lineColor: '#000000' });
      } catch {
        const safe = value.replace(/[^\x20-\x7E]/g, '');
        try { JsBarcode(svgRef.current!, safe, { format: 'CODE128', width: 2, height, displayValue: false, margin: 6 }); } catch { /* ignore */ }
      }
    });
  }, [value, height]);
  return <svg ref={svgRef} className="w-full" />;
}

// ─── Barcode Card — etiqueta 150mm × 100mm ────────────────────────────────────

function BarcodeCard({ value, palletNum, total, storeCod, pickerLabel, allCategories, totalPickers }: {
  value: string; palletNum: number; total: number;
  storeCod: string; pickerLabel: string; allCategories: string[];
  totalPickers: number;
}) {
  const storeName = getStoreName(storeCod);
  return (
    <div
      className="picking-label bg-white border-2 border-gray-200 rounded-xl overflow-hidden print:break-after-page print:rounded-none print:border print:border-gray-400"
      style={{ maxWidth: 520, margin: '0 auto 16px' }}
    >
      <div className="flex flex-col" style={{ padding: '12px 14px 8px', minHeight: 200 }}>

        {/* Top row: picker (izquierda) + número de pallet (derecha) */}
        <div className="flex items-start justify-between" style={{ marginBottom: 4 }}>
          <div className="min-w-0 flex-1 pr-3">
            {/* Nombre del picker — letra grande */}
            <div style={{ fontSize: 20, fontWeight: 800, color: '#111', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pickerLabel}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2, fontWeight: 500 }}>
              Pickers {totalPickers}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-barlow-condensed font-black text-amber-600 leading-none" style={{ fontSize: 48 }}>
              P-{palletNum}
            </div>
            <div style={{ fontSize: 10, color: '#aaa', textAlign: 'right' }}>de {total}</div>
          </div>
        </div>

        {/* Categorías — prominentes */}
        {allCategories.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            {allCategories.map(c => (
              <span key={c} style={{
                fontSize: 16, fontWeight: 800, color: '#1A2550',
                background: 'rgba(26,37,80,0.09)', borderRadius: 6,
                padding: '2px 10px', letterSpacing: '0.5px',
              }}>{c}</span>
            ))}
          </div>
        )}

        {/* Centro: código de tienda + nombre */}
        <div className="flex-1 flex flex-col items-center justify-center text-center" style={{ padding: '4px 0' }}>
          <div className="font-barlow-condensed font-black text-gray-900 tracking-widest uppercase leading-none"
            style={{ fontSize: 'clamp(36px, 9vw, 60px)', letterSpacing: '3px' }}>
            {storeCod}
          </div>
          <div className="font-barlow-condensed font-semibold text-gray-600 uppercase tracking-wide" style={{ fontSize: 15, marginTop: 4 }}>
            {storeName}
          </div>
        </div>

        {/* Código de barras en la parte inferior */}
        <div style={{ marginTop: 4 }}>
          <Barcode1D value={value} height={44} />
          <div style={{ textAlign: 'center', fontSize: 9, fontFamily: 'monospace', color: '#bbb', marginTop: 1, wordBreak: 'break-all', lineHeight: 1.2 }}>
            {value}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Picker Group Card (split: form izquierda | barcodes derecha) ─────────────

function PickerGroupCard({ group, displayName, pallets, onNameChange, onPalletsChange, onRefreshOp, refreshingId, totalPickers }: {
  group: PickerGroup; displayName: string; pallets: number;
  onNameChange: (v: string) => void; onPalletsChange: (n: number) => void;
  onRefreshOp: (op: PickingOperation) => void; refreshingId: number | null;
  totalPickers: number;
}) {
  const allDone       = group.operations.every(o => o.state === 'done');
  const allCategories = [...new Set(group.operations.flatMap(o => o.categories))];
  const refs          = group.operations.map(o => o.name).join('+');
  const cats          = allCategories.join(',');
  // El nombre se incluye en el barcode. Si no se ingresó, usar el nombre Odoo (group.key)
  const pickerLabel   = displayName || group.key;
  const barcodePickerName = sanitizeForBarcode(pickerLabel);

  const borderColor = allDone ? 'rgba(22,163,74,0.40)' : 'rgba(26,37,80,0.12)';
  const shadow      = allDone ? '0 2px 16px rgba(22,163,74,0.12)' : '0 1px 8px rgba(26,37,80,0.07)';

  return (
    <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor, boxShadow: shadow }}>

      {/* Card header */}
      <div className="px-5 py-3 border-b flex items-center justify-between"
        style={{ background: allDone ? 'rgba(22,163,74,0.05)' : 'rgba(26,37,80,0.02)', borderColor: allDone ? 'rgba(22,163,74,0.15)' : '#F0F2F5' }}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-[14px] font-bold text-navy bg-[rgba(26,37,80,0.09)] px-3 py-1 rounded-lg shrink-0">{group.key}</span>
          {displayName && <span className="text-[16px] font-semibold text-text truncate">{displayName}</span>}
          {allDone && <span className="text-[13px] font-bold text-[#16A34A] shrink-0">✓ Realizado</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {allCategories.map(c => (
            <span key={c} className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(26,37,80,0.07)] text-navy">{c}</span>
          ))}
          <span className="text-[13px] text-text-3">{group.operations.length} op.</span>
        </div>
      </div>

      {/* Split body */}
      <div className="flex flex-col lg:flex-row">

        {/* LEFT: Form */}
        <div className="lg:w-[45%] p-5 border-b lg:border-b-0 lg:border-r border-gray-100 print:hidden space-y-4">

          {/* Operaciones HORIZONTALES cuando hay más de una */}
          <div className={group.operations.length > 1 ? 'flex flex-wrap gap-2' : ''}>
            {group.operations.map(op => (
              <div key={op.id}
                className={`flex items-start gap-2 ${group.operations.length > 1
                  ? 'flex-1 min-w-[150px] border border-gray-100 rounded-xl p-3 bg-[#FAFAFA]'
                  : 'pb-2'
                }`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[14px] font-bold text-navy">{op.name}</span>
                    <StateBadge state={op.state} />
                  </div>
                  {op.categories.length > 0 && (
                    <div className="text-[13px] text-text-3 mt-0.5">{op.categories.join(' · ')}</div>
                  )}
                  {(op.fromLocation || op.toLocation) && (
                    <div className="text-[12px] text-text-3 mt-0.5">
                      {op.fromLocation && <span><span className="font-semibold text-text-2">De:</span> {op.fromLocation}</span>}
                      {op.fromLocation && op.toLocation && <span className="mx-1">→</span>}
                      {op.toLocation && <span><span className="font-semibold text-text-2">A:</span> <span className="font-semibold text-navy">{op.toLocation}</span></span>}
                    </div>
                  )}
                  {op.origin && <div className="text-[11px] text-text-3 mt-0.5 truncate">{op.origin}</div>}
                </div>
                {op.state !== 'done' && (
                  <button onClick={() => onRefreshOp(op)} disabled={refreshingId === op.id}
                    className="text-[13px] shrink-0 border rounded-full px-2.5 py-1.5 cursor-pointer disabled:opacity-40"
                    style={{ borderColor: 'rgba(37,99,235,0.35)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                    {refreshingId === op.id ? '⏳' : '↻'}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Nombre del picker */}
          <div>
            <label className="text-[12px] font-bold text-text-3 uppercase tracking-wide block mb-1.5">
              Nombre del picker <span className="text-amber-600 font-bold">*</span>
              <span className="ml-1 text-[11px] font-normal normal-case text-text-3">(se incluye en el código)</span>
            </label>
            <input type="text" value={displayName} onChange={e => onNameChange(e.target.value)}
              placeholder={`${group.key} — ingresa nombre real…`}
              className="w-full border rounded-xl px-4 py-3 text-[16px] font-barlow text-text bg-white outline-none transition-colors"
              style={{ borderColor: displayName ? 'rgba(22,163,74,0.5)' : 'rgba(217,119,6,0.5)' }} />
            {!displayName && (
              <div className="text-[12px] text-amber-600 mt-1">⚠ Se usará &quot;{group.key}&quot; si no ingresas nombre</div>
            )}
          </div>

          {/* Pallets */}
          <div>
            <label className="text-[12px] font-bold text-text-3 uppercase tracking-wide block mb-1.5">Cantidad de pallets</label>
            <div className="flex items-center gap-3">
              <button onClick={() => onPalletsChange(Math.max(0, pallets - 1))}
                className="w-12 h-12 rounded-full border border-border font-bold text-[22px] text-text-2 cursor-pointer bg-bg hover:bg-border flex items-center justify-center transition-colors">−</button>
              <input type="number" min={0} value={pallets === 0 ? '' : pallets}
                onChange={e => onPalletsChange(Math.max(0, parseInt(e.target.value) || 0))}
                placeholder="0"
                className="flex-1 border border-border rounded-xl px-3 py-3 text-[28px] font-barlow-condensed font-bold text-center text-navy bg-white outline-none focus:border-amber-400 transition-colors" />
              <button onClick={() => onPalletsChange(pallets + 1)}
                className="w-12 h-12 rounded-full border border-border font-bold text-[22px] text-text-2 cursor-pointer bg-bg hover:bg-border flex items-center justify-center transition-colors">+</button>
            </div>
            <div className="flex gap-2 mt-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => onPalletsChange(n)}
                  className="flex-1 py-2 rounded-lg text-[15px] font-bold cursor-pointer transition-all active:scale-95"
                  style={{
                    background: pallets === n ? 'rgba(217,119,6,0.18)' : 'rgba(26,37,80,0.05)',
                    color: pallets === n ? '#D97706' : '#6B7280',
                    border: `1px solid ${pallets === n ? 'rgba(217,119,6,0.4)' : 'rgba(26,37,80,0.10)'}`,
                  }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Barcodes inline */}
        <div className="lg:w-[55%] p-4 bg-[#FAFAFA]">
          {pallets === 0 ? (
            <div className="h-full min-h-[180px] flex flex-col items-center justify-center gap-3 text-text-3">
              <div className="text-[40px] opacity-30">▊▊▊▊</div>
              <div className="text-[14px] text-center">Ingresa la cantidad de pallets<br/>para generar los códigos</div>
            </div>
          ) : (
            <div>
              <div className="print:hidden flex items-center justify-between mb-3">
                <div className="text-[13px] font-semibold text-text-2">{pallets} código{pallets !== 1 ? 's' : ''}</div>
                <button onClick={() => window.print()}
                  className="flex items-center gap-1.5 text-[14px] font-bold cursor-pointer px-4 py-2 rounded-xl transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #78350F, #D97706)', color: '#fff' }}>
                  🖨 Imprimir
                </button>
              </div>
              {Array.from({ length: pallets }, (_, i) => (
                <BarcodeCard
                  key={i}
                  value={`${group.storeCod}|${barcodePickerName}|${refs}|P${i + 1}|${cats}`}
                  palletNum={i + 1}
                  total={pallets}
                  storeCod={group.storeCod}
                  pickerLabel={pickerLabel}
                  allCategories={allCategories}
                  totalPickers={totalPickers}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Store List Panel ─────────────────────────────────────────────────────────

function StoreListPanel({ selectedCods, loadingCods, opsMap, todayStores, storesLoading, onToggleStore }: {
  selectedCods: string[]; loadingCods: string[];
  opsMap: Record<string, PickingOperation[]>;
  todayStores: TodayStore[]; storesLoading: boolean;
  onToggleStore: (cod: string) => void;
}) {
  const [q, setQ] = useState('');

  const { grouped, isFallback } = useMemo(() => {
    const upper = q.trim().toUpperCase();
    let source: TodayStore[];
    let fallback = false;

    if (todayStores.length > 0) {
      const filtered = upper
        ? todayStores.filter(s => s.cod.includes(upper) || s.name.toUpperCase().includes(upper))
        : todayStores;
      if (filtered.length > 0) { source = filtered; }
      else {
        source = Object.entries(TIENDAS_INICIAL)
          .filter(([cod, info]) => !upper || cod.includes(upper) || info.n.toUpperCase().includes(upper))
          .map(([cod, info]) => ({ cod, name: info.n, sources: [] as ('rm' | 'regiones')[] }));
        fallback = true;
      }
    } else {
      source = Object.entries(TIENDAS_INICIAL)
        .filter(([cod, info]) => !upper || cod.includes(upper) || info.n.toUpperCase().includes(upper))
        .map(([cod, info]) => ({ cod, name: info.n, sources: [] as ('rm' | 'regiones')[] }));
      fallback = true;
    }

    const groups: Record<StoreGroupKey, TodayStore[]> = { region: [], costa: [], santiago: [] };
    for (const store of source) groups[getStoreGroup(store)].push(store);
    for (const key of Object.keys(groups) as StoreGroupKey[]) groups[key].sort((a, b) => a.cod.localeCompare(b.cod));
    return { grouped: groups, isFallback: fallback };
  }, [q, todayStores]);

  const GROUP_ORDER: StoreGroupKey[]  = ['region', 'costa', 'santiago'];
  const GROUP_STYLE: Record<StoreGroupKey, { bg: string; color: string }> = {
    region:   { bg: 'rgba(37,99,235,0.07)',  color: '#1D4ED8' },
    costa:    { bg: 'rgba(16,185,129,0.07)', color: '#059669' },
    santiago: { bg: 'rgba(26,37,80,0.05)',   color: '#374151' },
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
        <div className="font-barlow-condensed text-[14px] font-bold text-navy uppercase tracking-widest mb-2 flex items-center gap-2">
          Tiendas de hoy
          {storesLoading
            ? <span className="text-[12px] text-text-3 font-normal normal-case">cargando…</span>
            : todayStores.length > 0
              ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[rgba(217,119,6,0.12)] text-amber-700">{todayStores.length}</span>
              : null}
          {selectedCods.length > 0 && (
            <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">{selectedCods.length} sel.</span>
          )}
        </div>
        <div className="flex items-center gap-2 bg-[#F5F6FA] border border-border rounded-xl px-3 py-2.5">
          <svg className="w-4 h-4 text-text-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input type="text" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar tienda…"
            className="flex-1 bg-transparent border-none outline-none text-[14px] font-barlow text-text min-w-0" />
          {q && <button onClick={() => setQ('')} className="text-text-3 border-none bg-transparent cursor-pointer text-[18px] leading-none shrink-0">×</button>}
        </div>
        {isFallback && !storesLoading && (
          <div className="mt-1.5 text-[12px] text-text-3 italic">
            {todayStores.length === 0 ? 'Sin despachos hoy — mostrando todas' : 'Sin coincidencias hoy — buscando en todas'}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {storesLoading && <div className="px-4 py-6 text-center text-[13px] text-text-3">Cargando despachos de hoy…</div>}

        {!storesLoading && GROUP_ORDER.map(gKey => {
          const stores = grouped[gKey];
          if (stores.length === 0) return null;
          const style = GROUP_STYLE[gKey];
          return (
            <div key={gKey}>
              <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest sticky top-0 z-10"
                style={{ background: style.bg, color: style.color, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                {GROUP_LABELS[gKey]} ({stores.length})
              </div>
              {stores.map(store => {
                const isSelected   = selectedCods.includes(store.cod);
                const isLoading    = loadingCods.includes(store.cod);
                const ops          = opsMap[store.cod];
                const allDone      = ops && ops.length > 0 && ops.every(o => o.state === 'done');
                const pickerCount  = isSelected && ops
                  ? new Set(ops.map(o => o.responsible || 'Sin asignar')).size
                  : 0;
                const opCount = ops?.length ?? 0;

                return (
                  <button key={store.cod} onClick={() => onToggleStore(store.cod)} disabled={isLoading}
                    className="w-full flex items-center gap-2.5 px-4 py-3 border-b border-border cursor-pointer text-left transition-all disabled:cursor-wait"
                    style={{
                      background: isSelected ? 'rgba(217,119,6,0.09)' : 'transparent',
                      borderLeft: `4px solid ${allDone ? '#16A34A' : isSelected ? '#D97706' : 'transparent'}`,
                    }}>
                    {/* Checkbox */}
                    <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all"
                      style={{ borderColor: allDone ? '#16A34A' : isSelected ? '#D97706' : 'rgba(26,37,80,0.2)', background: isSelected ? (allDone ? '#16A34A' : '#D97706') : 'transparent' }}>
                      {isSelected && <span className="text-white text-[11px] font-bold leading-none">{allDone ? '✓' : '✓'}</span>}
                    </div>
                    <span className="font-mono text-[13px] font-bold shrink-0 px-2 py-0.5 rounded-lg"
                      style={{ background: isSelected ? 'rgba(217,119,6,0.15)' : 'rgba(26,37,80,0.07)', color: isSelected ? '#D97706' : '#374151' }}>
                      {store.cod}
                    </span>
                    <span className="text-[14px] truncate flex-1" style={{ color: isSelected ? '#B45309' : '#374151', fontWeight: isSelected ? 600 : 400 }}>
                      {store.name}
                    </span>
                    {isLoading && <span className="text-[14px] shrink-0">⏳</span>}

                    {/* Badge verde cuando todo done */}
                    {allDone && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: 'rgba(22,163,74,0.15)', color: '#16A34A', border: '1px solid rgba(22,163,74,0.3)' }}>
                        ✓ Listo
                      </span>
                    )}

                    {/* Badge normal cuando seleccionado y tiene ops */}
                    {isSelected && !isLoading && !allDone && opCount > 0 && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: 'rgba(217,119,6,0.18)', color: '#D97706' }}>
                        {pickerCount}p · {opCount}op
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Session helpers ──────────────────────────────────────────────────────────

function loadSession(): Partial<PickingSession> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    const s = JSON.parse(raw) as PickingSession;
    if (s.date !== todayISO()) return {}; // sesión de otro día → ignorar
    return s;
  } catch { return {}; }
}

function saveSession(data: PickingSession): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function PickingScreen() {
  const router = useRouter();
  const { profile, signOut } = useAuth();

  const odooConfig: OdooConfig = getOdooConfig() ?? { url: '', db: '', username: '', apiKey: '' };
  const hasOdoo = !!odooConfig.url;

  const [panelView, setPanelView] = useState<'stores' | 'planilla'>('stores');

  // Restaurar sesión al montar
  const session = useMemo(() => loadSession(), []);

  const [selectedCods, setSelectedCods] = useState<string[]>(session.selectedCods ?? []);
  const [opsMap, setOpsMap]             = useState<Record<string, PickingOperation[]>>(session.opsMap ?? {});
  const [loadingCods, setLoadingCods]   = useState<string[]>([]);
  const [lastRefresh, setLastRefresh]   = useState<Date | null>(null);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [todayStores, setTodayStores]   = useState<TodayStore[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);

  const [pickerDisplayNames, setPickerDisplayNames] = useState<Record<string, string>>(() => {
    const fromSession = session.pickerDisplayNames;
    if (fromSession && Object.keys(fromSession).length > 0) return fromSession;
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(SAVED_NAMES_KEY) ?? '{}') as Record<string, string>; }
    catch { return {}; }
  });
  const [pickerPallets, setPickerPallets] = useState<Record<string, number>>(session.pickerPallets ?? {});

  // Persistir nombres en localStorage (cross-session)
  useEffect(() => {
    localStorage.setItem(SAVED_NAMES_KEY, JSON.stringify(pickerDisplayNames));
  }, [pickerDisplayNames]);

  // Persistir sesión en sessionStorage cuando cambia el estado relevante
  useEffect(() => {
    saveSession({ date: todayISO(), selectedCods, opsMap, pickerPallets, pickerDisplayNames });
  }, [selectedCods, opsMap, pickerPallets, pickerDisplayNames]);

  // Cargar tiendas del calendario
  useEffect(() => {
    const DAY_CODES = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
    setStoresLoading(true);
    fetchCalendarioCompleto().then(cal => {
      const today = DAY_CODES[new Date().getDay()];
      const day = cal[today];
      if (!day) { setStoresLoading(false); return; }
      setTodayStores([
        ...day.fal.map(cod   => ({ cod, name: getStoreName(cod), sources: ['regiones'] as ('rm' | 'regiones')[] })),
        ...day.costa.map(cod => ({ cod, name: getStoreName(cod), sources: ['rm']       as ('rm' | 'regiones')[] })),
        ...day.rm.map(cod    => ({ cod, name: getStoreName(cod), sources: ['rm']       as ('rm' | 'regiones')[] })),
      ]);
      setStoresLoading(false);
    }).catch(() => setStoresLoading(false));
  }, []);

  // Si hay tiendas seleccionadas al restaurar sesión, mostrar planilla
  useEffect(() => {
    if (selectedCods.length > 0) setPanelView('planilla');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allGroups = useMemo((): PickerGroup[] => {
    const result: PickerGroup[] = [];
    for (const cod of selectedCods) {
      const ops = opsMap[cod] ?? [];
      const map: Record<string, PickingOperation[]> = {};
      for (const op of ops) {
        const k = op.responsible || 'Sin asignar';
        if (!map[k]) map[k] = [];
        map[k].push(op);
      }
      for (const [key, gOps] of Object.entries(map).sort(([a], [b]) => a.localeCompare(b))) {
        result.push({ key, storeCod: cod, stateKey: `${cod}__${key}`, operations: gOps });
      }
    }
    return result;
  }, [selectedCods, opsMap]);

  const fetchOpsForStore = useCallback(async (cod: string) => {
    if (!hasOdoo) return;
    setLoadingCods(prev => [...prev, cod]);
    try {
      const res  = await fetch('/api/odoo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
      const parsed: PickingOperation[] = (data.pickings ?? [])
        .filter(p => isAbastecimientoOp(p.origin))
        .map(p => {
          const { categories, storeCode, originDate } = parseOrigin(p.origin);
          return { ...p, categories, storeCodeFromOrigin: storeCode, originDate };
        });
      setOpsMap(prev => ({ ...prev, [cod]: parsed }));
      setLastRefresh(new Date());
    } catch (e) {
      console.error('[picking]', e);
    } finally {
      setLoadingCods(prev => prev.filter(c => c !== cod));
    }
  }, [hasOdoo, odooConfig]);

  // Auto-refresh silencioso cada 3 minutos para tiendas seleccionadas
  useEffect(() => {
    if (selectedCods.length === 0) return;
    const id = setInterval(() => {
      selectedCods.forEach(cod => void fetchOpsForStore(cod));
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [selectedCods, fetchOpsForStore]);

  const handleToggleStore = useCallback(async (cod: string) => {
    const isSelected = selectedCods.includes(cod);
    if (isSelected) {
      setSelectedCods(prev => prev.filter(c => c !== cod));
    } else {
      setSelectedCods(prev => [...prev, cod]);
      if (!opsMap[cod]) await fetchOpsForStore(cod);
    }
    setPanelView('planilla');
  }, [selectedCods, opsMap, fetchOpsForStore]);

  const refreshOp = useCallback(async (op: PickingOperation, storeCod: string) => {
    if (!hasOdoo) return;
    setRefreshingId(op.id);
    try {
      const res  = await fetch('/api/odoo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'picking_check_state', config: odooConfig, query: op.name }),
      });
      const data = (await res.json()) as { state?: string; dateDone?: string | null };
      if (res.ok && data.state) {
        setOpsMap(prev => ({
          ...prev,
          [storeCod]: (prev[storeCod] ?? []).map(o =>
            o.id === op.id ? { ...o, state: data.state!, dateDone: data.dateDone ?? o.dateDone } : o
          ),
        }));
      }
    } catch { /* silent */ }
    setRefreshingId(null);
  }, [hasOdoo, odooConfig]);

  const hasBarcodes    = allGroups.some(g => (pickerPallets[g.stateKey] ?? 0) > 0);
  const todayLabel     = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const groupedByStore = useMemo(() => {
    const map: Record<string, PickerGroup[]> = {};
    for (const g of allGroups) { if (!map[g.storeCod]) map[g.storeCod] = []; map[g.storeCod].push(g); }
    return map;
  }, [allGroups]);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#F5F6FA]">
      <style dangerouslySetInnerHTML={{ __html:
        '@media print{@page{size:150mm 100mm;margin:0}' +
        '.picking-label{width:150mm!important;height:100mm!important;max-width:150mm!important;' +
        'border-radius:0!important;margin:0!important;border:1px solid #ccc!important;}}'
      }} />

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0 print:hidden"
        style={{ background: 'linear-gradient(135deg, #78350F 0%, #D97706 100%)', boxShadow: '0 2px 16px rgba(217,119,6,0.35)' }}>
        <button className="lg:hidden border-none bg-white/15 text-white text-[14px] cursor-pointer font-barlow px-3 py-2 rounded-full"
          onClick={() => setPanelView(v => v === 'planilla' ? 'stores' : 'planilla')}>
          {panelView === 'planilla' ? '← Tiendas' : '← Inicio'}
        </button>
        <button className="hidden lg:inline-flex border-none bg-white/15 text-white text-[14px] cursor-pointer font-barlow px-3 py-2 rounded-full"
          onClick={() => router.push('/')}>← Inicio</button>

        <div className="flex-1 min-w-0">
          <div className="font-barlow-condensed text-[24px] font-bold text-white tracking-widest uppercase leading-tight">Picking</div>
          <div className="text-[12px] text-white/50 uppercase tracking-widest truncate">
            {selectedCods.length > 0
              ? `${selectedCods.join(' · ')} · ${todayLabel}`
              : `Supervisión · ${profile?.full_name ?? ''}`}
          </div>
        </div>

        {/* Auto-refresh indicator */}
        {selectedCods.length > 0 && (
          <div className="hidden lg:flex items-center gap-1 text-[11px] text-white/40 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            auto ↻3min
          </div>
        )}

        {hasBarcodes && (
          <button onClick={() => window.print()}
            className="border-none bg-white/20 text-white font-bold text-[15px] cursor-pointer px-4 py-2 rounded-xl flex items-center gap-2 shrink-0">
            🖨 Imprimir todo
          </button>
        )}
        {lastRefresh && (
          <div className="text-[11px] text-white/50 hidden lg:block shrink-0">
            ↻ {lastRefresh.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
        <button onClick={() => router.push('/perfil')}
          className="border-none bg-white/12 text-white/80 text-[14px] cursor-pointer px-3 py-2 rounded-full shrink-0">👤</button>
        <button onClick={async () => { await signOut(); router.push('/login'); }}
          className="border-none bg-white/10 text-white/70 text-[14px] cursor-pointer font-barlow px-3 py-2 rounded-full shrink-0">Salir</button>
      </div>

      {/* ── Split body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT PANEL */}
        <div className={[
          'flex flex-col bg-white border-r border-border shrink-0 overflow-hidden',
          'w-full lg:w-72 xl:w-80',
          panelView === 'planilla' ? 'hidden lg:flex' : 'flex',
        ].join(' ')}>
          <StoreListPanel
            selectedCods={selectedCods}
            loadingCods={loadingCods}
            opsMap={opsMap}
            todayStores={todayStores}
            storesLoading={storesLoading}
            onToggleStore={handleToggleStore}
          />
        </div>

        {/* RIGHT PANEL */}
        <div className={[
          'flex flex-col flex-1 overflow-hidden',
          panelView === 'stores' ? 'hidden lg:flex' : 'flex',
        ].join(' ')}>

          {selectedCods.length === 0 ? (
            <div className="m-auto text-center px-8 py-12">
              <div className="text-[56px] mb-4">🏪</div>
              <div className="font-barlow-condensed text-[24px] font-bold text-text-2 mb-2">Selecciona una o más tiendas</div>
              <div className="text-[15px] text-text-3 max-w-sm mx-auto">
                Selecciona varias tiendas para gestionar sus operaciones en conjunto. El estado se guarda durante la sesión.
              </div>
              {!hasOdoo && (
                <div className="mt-6 bg-white border border-[rgba(220,38,38,0.25)] rounded-xl px-4 py-3 text-[14px] text-red text-left inline-block">
                  <span className="font-bold">Odoo no configurado.</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 pb-10">
              <div className="mt-4 mb-4 flex items-center justify-between print:hidden">
                <div>
                  <div className="text-[15px] font-semibold text-text-2">
                    {allGroups.length === 0
                      ? 'Sin operaciones de Abastecimiento hoy'
                      : `${allGroups.length} picker${allGroups.length !== 1 ? 's' : ''} · ${selectedCods.length} tienda${selectedCods.length !== 1 ? 's' : ''}`}
                  </div>
                  {lastRefresh && (
                    <div className="text-[13px] text-text-3">
                      Actualizado: {lastRefresh.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => selectedCods.forEach(cod => void fetchOpsForStore(cod))}
                  disabled={loadingCods.length > 0}
                  className="text-[14px] font-semibold cursor-pointer border rounded-full px-4 py-2 transition-all disabled:opacity-40"
                  style={{ borderColor: 'rgba(217,119,6,0.4)', color: '#D97706', background: 'rgba(217,119,6,0.06)' }}>
                  {loadingCods.length > 0 ? '⏳ Cargando…' : '↻ Actualizar todo'}
                </button>
              </div>

              {selectedCods.map(cod => {
                const storeGroups = groupedByStore[cod] ?? [];
                const isLoading   = loadingCods.includes(cod);
                const ops         = opsMap[cod];
                const allDoneStore = ops && ops.length > 0 && ops.every(o => o.state === 'done');
                return (
                  <div key={cod} className="mb-8">
                    <div className="flex items-center gap-3 mb-3 print:mb-2">
                      <span className="font-barlow-condensed text-[20px] font-bold text-navy uppercase tracking-wide">{cod}</span>
                      <span className="text-[16px] text-text-2 font-semibold">{getStoreName(cod)}</span>
                      {allDoneStore && (
                        <span className="text-[13px] font-bold px-3 py-0.5 rounded-full"
                          style={{ background: 'rgba(22,163,74,0.12)', color: '#16A34A', border: '1px solid rgba(22,163,74,0.3)' }}>
                          ✓ Todo realizado
                        </span>
                      )}
                      {isLoading && <span className="text-[14px] text-text-3">Cargando…</span>}
                      {!isLoading && storeGroups.length === 0 && (
                        <span className="text-[14px] text-text-3 italic">Sin operaciones de Abastecimiento hoy</span>
                      )}
                    </div>

                    <div className="space-y-4">
                      {storeGroups.map(group => (
                        <PickerGroupCard
                          key={group.stateKey}
                          group={group}
                          displayName={pickerDisplayNames[group.stateKey] ?? ''}
                          pallets={pickerPallets[group.stateKey] ?? 0}
                          onNameChange={name => setPickerDisplayNames(prev => ({ ...prev, [group.stateKey]: name }))}
                          onPalletsChange={n => setPickerPallets(prev => ({ ...prev, [group.stateKey]: n }))}
                          onRefreshOp={(op) => void refreshOp(op, cod)}
                          refreshingId={refreshingId}
                          totalPickers={storeGroups.length}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
