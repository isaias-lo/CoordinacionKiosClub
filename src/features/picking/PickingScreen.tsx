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
  const storeCode = storeMatch ? storeMatch[1] : '';
  const dateMatch = origin.match(/Fecha\((\d{2}\/\d{2}\/\d{4})\)/) ?? origin.match(/(\d{2}\/\d{2}\/\d{4})/);
  return { categories, storeCode, originDate: dateMatch ? dateMatch[1] : '' };
}

function getStoreName(cod: string): string {
  return TIENDAS_INICIAL[cod]?.n ?? cod;
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

// ─── 1D Barcode Component (Code128 via JsBarcode) ────────────────────────────

function Barcode1D({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    import('jsbarcode').then(({ default: JsBarcode }) => {
      if (!svgRef.current) return;
      try {
        JsBarcode(svgRef.current, value, {
          format: 'CODE128',
          width: 2.5,
          height: 80,
          displayValue: false,
          margin: 12,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch {
        // Sanitize and retry
        const safe = value.replace(/[^\x20-\x7E]/g, '');
        try { JsBarcode(svgRef.current!, safe, { format: 'CODE128', width: 2.5, height: 80, displayValue: false, margin: 12 }); }
        catch { /* give up */ }
      }
    });
  }, [value]);

  return <svg ref={svgRef} className="w-full" />;
}

// ─── Barcode Sheet (N copies = N pallets) ─────────────────────────────────────

function BarcodeSheet({
  group, storeCode, displayName, pallets, onBack,
}: {
  group: PickerGroup;
  storeCode: string;
  displayName: string;
  pallets: number;
  onBack: () => void;
}) {
  const copies = Math.max(1, pallets);
  const storeName = getStoreName(storeCode);
  const refs = group.operations.map(o => o.name).join('+');
  const pickerLabel = displayName || group.key;
  const allCategories = [...new Set(group.operations.flatMap(o => o.categories))];
  const todayStr = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">

      {/* Header — hidden when printing */}
      <div className="print:hidden flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #78350F 0%, #D97706 100%)', boxShadow: '0 2px 16px rgba(217,119,6,0.35)' }}>
        <button onClick={onBack}
          className="border-none bg-white/15 text-white text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full">
          ← Volver
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase">
            {copies} Código{copies !== 1 ? 's' : ''} de Barra
          </div>
          <div className="text-[11px] text-white/60 uppercase tracking-widest truncate">
            {pickerLabel} · {storeCode} {storeName} · {todayStr}
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="border-none bg-white/20 text-white font-bold text-[13px] cursor-pointer font-barlow px-4 py-2 rounded-full">
          🖨 Imprimir
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-10 max-w-lg mx-auto w-full">

        <p className="print:hidden text-[12px] text-text-3 mt-4 mb-2 text-center">
          {copies} copia{copies !== 1 ? 's' : ''} · Una por pallet · Usa <strong>Imprimir</strong> para obtenerlas en papel
        </p>

        {Array.from({ length: copies }, (_, i) => {
          // Barcode value: TIENDA|REFS|P{n}
          const barcodeValue = `${storeCode}|${refs}|P${i + 1}`;

          return (
            <div key={i}
              className="bg-white border border-border rounded-card mb-4 p-5 print:mb-0 print:border-0 print:rounded-none"
              style={{ boxShadow: '0 1px 10px rgba(26,37,80,0.07)', pageBreakAfter: 'always' }}>

              {/* Copy header */}
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <div className="font-barlow-condensed text-[18px] font-bold text-navy uppercase tracking-wide leading-tight">
                    {storeCode} — {storeName}
                  </div>
                  <div className="text-[12px] text-text-2 font-semibold mt-0.5">
                    {pickerLabel}{displayName && group.key !== displayName ? ` (${group.key})` : ''}
                  </div>
                </div>
                <div className="text-right ml-3 shrink-0">
                  <div className="font-barlow-condensed text-[28px] font-bold text-amber-600 leading-none">{i + 1}</div>
                  <div className="text-[10px] text-text-3 uppercase">de {copies}</div>
                </div>
              </div>

              {/* Barcode graphic */}
              <div className="border border-gray-100 rounded-lg p-2 bg-white">
                <Barcode1D value={barcodeValue} />
                <div className="text-center text-[10px] font-mono text-text-3 mt-1 select-all break-all">
                  {barcodeValue}
                </div>
              </div>

              {/* Operation details */}
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

// ─── Picker Group Card (Planilla row) ─────────────────────────────────────────

function PickerGroupCard({
  group, displayName, pallets, onNameChange, onPalletsChange, onGenerateCodes, onRefreshOp, refreshingId,
}: {
  group: PickerGroup;
  displayName: string;
  pallets: number;
  onNameChange: (v: string) => void;
  onPalletsChange: (n: number) => void;
  onGenerateCodes: () => void;
  onRefreshOp: (op: PickingOperation) => void;
  refreshingId: number | null;
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
            <span className="font-mono text-[12px] font-bold text-navy bg-[rgba(26,37,80,0.08)] px-2.5 py-1 rounded shrink-0">
              {group.key}
            </span>
            {allDone && <span className="text-[11px] font-bold text-[#16A34A]">✓ Todo realizado</span>}
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

      {/* Operations */}
      <div className="px-4 pt-3 space-y-2">
        {group.operations.map(op => (
          <div key={op.id} className="flex items-start gap-2 pb-2 border-b border-dashed border-border last:border-b-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[12px] font-bold text-navy">{op.name}</span>
                <StateBadge state={op.state} />
              </div>
              {op.categories.length > 0 && (
                <div className="text-[11px] text-text-3 mt-0.5">{op.categories.join(' · ')}</div>
              )}
              {op.origin && (
                <div className="text-[10px] text-text-3 mt-0.5 truncate">{op.origin}</div>
              )}
              {(op.fromLocation || op.toLocation) && (
                <div className="text-[10px] text-text-3 mt-0.5">
                  De: <span className="font-semibold">{op.fromLocation}</span>
                  {op.toLocation && <> → A: <span className="font-semibold text-navy">{op.toLocation}</span></>}
                </div>
              )}
            </div>
            {op.state !== 'done' && (
              <button
                onClick={() => onRefreshOp(op)}
                disabled={refreshingId === op.id}
                title="Verificar estado en Odoo"
                className="text-[11px] shrink-0 border rounded-full px-2 py-1 cursor-pointer disabled:opacity-40 transition-colors"
                style={{ borderColor: 'rgba(37,99,235,0.35)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                {refreshingId === op.id ? '⏳' : '↻'}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Name + pallets inputs */}
      <div className="px-4 py-4 space-y-3">

        {/* Picker name */}
        <div>
          <label className="text-[10px] font-bold text-text-3 uppercase tracking-wide block mb-1">
            Nombre del picker
          </label>
          <input
            type="text"
            value={displayName}
            onChange={e => onNameChange(e.target.value)}
            placeholder={`Nombre real para ${group.key}…`}
            className="w-full border border-border rounded-card px-3 py-2.5 text-[14px] font-barlow text-text bg-white outline-none focus:border-amber-400 transition-colors"
          />
        </div>

        {/* Pallets */}
        <div>
          <label className="text-[10px] font-bold text-text-3 uppercase tracking-wide block mb-1">
            Cantidad de pallets
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onPalletsChange(Math.max(0, pallets - 1))}
              className="w-10 h-10 rounded-full border border-border font-bold text-[20px] text-text-2 cursor-pointer bg-bg hover:bg-border flex items-center justify-center transition-colors">
              −
            </button>
            <input
              type="number"
              min={0}
              value={pallets === 0 ? '' : pallets}
              onChange={e => onPalletsChange(Math.max(0, parseInt(e.target.value) || 0))}
              placeholder="0"
              className="flex-1 border border-border rounded-card px-3 py-2.5 text-[22px] font-barlow-condensed font-bold text-center text-navy bg-white outline-none focus:border-amber-400 transition-colors"
            />
            <button
              onClick={() => onPalletsChange(pallets + 1)}
              className="w-10 h-10 rounded-full border border-border font-bold text-[20px] text-text-2 cursor-pointer bg-bg hover:bg-border flex items-center justify-center transition-colors">
              +
            </button>
          </div>
        </div>

        <button
          onClick={onGenerateCodes}
          disabled={pallets === 0}
          className="w-full py-3 rounded-card font-barlow-condensed text-[16px] font-bold text-white cursor-pointer disabled:opacity-40 transition-all active:scale-95"
          style={{ background: pallets > 0 ? 'linear-gradient(135deg, #78350F, #D97706)' : 'rgba(107,114,128,0.3)' }}>
          {pallets === 0
            ? 'Ingresa la cantidad de pallets'
            : `Generar ${pallets} código${pallets !== 1 ? 's' : ''} de barra`}
        </button>
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
  const [storeQuery, setStoreQuery] = useState('');
  const [storeSuggestions, setStoreSuggestions] = useState<{ cod: string; name: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [operations, setOperations] = useState<PickingOperation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Picker names: persisted in localStorage, keyed by Odoo responsible name
  const [pickerDisplayNames, setPickerDisplayNames] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(SAVED_NAMES_KEY) ?? '{}') as Record<string, string>; }
    catch { return {}; }
  });
  const [pickerPallets, setPickerPallets] = useState<Record<string, number>>({});
  const [barcodeGroup, setBarcodeGroup] = useState<PickerGroup | null>(null);

  // Persist picker names to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(SAVED_NAMES_KEY, JSON.stringify(pickerDisplayNames));
  }, [pickerDisplayNames]);

  // Store autocomplete
  useEffect(() => {
    const q = storeQuery.replace(/.*·\s*/, '').trim().toUpperCase();
    if (!q) { setStoreSuggestions([]); return; }
    const matches = Object.entries(TIENDAS_INICIAL)
      .filter(([cod, info]) => cod.includes(q) || info.n.toUpperCase().includes(q))
      .slice(0, 8)
      .map(([cod, info]) => ({ cod, name: info.n }));
    setStoreSuggestions(matches);
  }, [storeQuery]);

  // Group operations by responsible (picker), sorted alphabetically
  const pickerGroups = useMemo((): PickerGroup[] => {
    const map: Record<string, PickingOperation[]> = {};
    for (const op of operations) {
      const key = op.responsible || 'Sin asignar';
      if (!map[key]) map[key] = [];
      map[key].push(op);
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, ops]) => ({ key, operations: ops }));
  }, [operations]);

  const selectStore = (cod: string) => {
    setStoreCod(cod);
    setStoreQuery(`${cod} · ${getStoreName(cod)}`);
    setShowSuggestions(false);
  };

  const fetchOperations = useCallback(async (cod: string) => {
    if (!hasOdoo) { setError('Odoo no configurado. Configura NEXT_PUBLIC_ODOO_*.'); return; }
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

  const refreshOp = useCallback(async (op: PickingOperation) => {
    if (!hasOdoo) return;
    setRefreshingId(op.id);
    try {
      const res = await fetch('/api/odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'picking_check_state', config: odooConfig, query: op.name }),
      });
      const data = (await res.json()) as { state?: string; dateDone?: string | null; error?: string };
      if (res.ok && data.state) {
        setOperations(prev => prev.map(o =>
          o.id === op.id ? { ...o, state: data.state!, dateDone: data.dateDone ?? o.dateDone } : o
        ));
      }
    } catch { /* silent */ }
    setRefreshingId(null);
  }, [hasOdoo, odooConfig]);

  // ── Barcode sheet view ──
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
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #78350F 0%, #D97706 100%)', boxShadow: '0 2px 16px rgba(217,119,6,0.35)' }}>
        {view === 'planilla' ? (
          <button onClick={() => setView('search')}
            className="border-none bg-white/15 text-white text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full">
            ← Volver
          </button>
        ) : (
          <button onClick={() => router.push('/')}
            className="border-none bg-white/15 text-white text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full">
            ← Inicio
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-barlow-condensed text-[22px] font-bold text-white tracking-widest uppercase leading-tight">
            {view === 'planilla' ? `Planilla · ${storeCod || 'Hoy'}` : 'Picking'}
          </div>
          <div className="text-[11px] text-white/50 uppercase tracking-widest truncate">
            {view === 'planilla'
              ? `${getStoreName(storeCod)} · ${todayLabel}`
              : `Supervisión · ${profile?.full_name ?? ''}`}
          </div>
        </div>
        <button onClick={() => router.push('/perfil')}
          className="border-none bg-white/12 text-white/80 text-[12px] cursor-pointer px-3 py-1.5 rounded-full shrink-0">
          👤
        </button>
        <button onClick={async () => { await signOut(); router.push('/login'); }}
          className="border-none bg-white/10 text-white/70 text-[12px] cursor-pointer font-barlow px-3 py-1.5 rounded-full shrink-0">
          Salir
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-10 max-w-lg mx-auto w-full">

        {/* ── SEARCH VIEW ── */}
        {view === 'search' && (
          <>
            {!hasOdoo && (
              <div className="mt-4 bg-white border border-[rgba(220,38,38,0.25)] rounded-card px-4 py-3 text-[12px] text-red">
                <span className="font-bold">Odoo no configurado.</span> Agrega las variables<br />
                <code className="text-[11px]">NEXT_PUBLIC_ODOO_URL · DB · USERNAME · API_KEY</code>
              </div>
            )}

            <div className="mt-6 text-[11px] font-bold text-text-3 uppercase tracking-widest mb-2">
              Código de tienda
            </div>

            {/* Store autocomplete */}
            <div className="relative">
              <div className="bg-white border border-border rounded-card px-4 py-3 flex items-center gap-3"
                style={{ boxShadow: '0 1px 6px rgba(26,37,80,0.06)' }}>
                <span className="text-[18px] shrink-0">🏪</span>
                <input
                  type="text"
                  value={storeQuery}
                  onChange={e => { setStoreQuery(e.target.value); setStoreCod(''); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="Ej: 02SCL, San Carlos, 17MAI…"
                  className="flex-1 bg-transparent border-none outline-none font-barlow text-[15px] text-text"
                />
                {storeQuery && (
                  <button onClick={() => { setStoreQuery(''); setStoreCod(''); setStoreSuggestions([]); }}
                    className="text-text-3 text-[18px] border-none bg-transparent cursor-pointer leading-none">×</button>
                )}
              </div>

              {showSuggestions && storeSuggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-card shadow-lg overflow-hidden">
                  {storeSuggestions.map(s => (
                    <button key={s.cod} onMouseDown={() => selectStore(s.cod)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-bg text-left border-none cursor-pointer border-b border-border last:border-b-0">
                      <span className="font-mono text-[12px] font-bold text-navy bg-[rgba(26,37,80,0.07)] px-2 py-0.5 rounded shrink-0">{s.cod}</span>
                      <span className="text-[13px] text-text truncate">{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="mt-3 text-[12px] text-red bg-white border border-[rgba(220,38,38,0.2)] rounded-card px-4 py-2">{error}</div>
            )}

            <button
              onClick={() => fetchOperations(storeCod)}
              disabled={loading || !hasOdoo}
              className="mt-4 w-full py-3.5 rounded-card font-barlow-condensed text-[17px] font-bold text-white cursor-pointer disabled:opacity-40 transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #78350F, #D97706)' }}>
              {loading ? '⏳ Buscando en Odoo…' : storeCod ? `Ver planilla de ${storeCod}` : 'Ver todas las operaciones de hoy'}
            </button>

            {/* Quick store chips */}
            <div className="mt-6 text-[11px] font-bold text-text-3 uppercase tracking-widest mb-2">
              Tiendas frecuentes
            </div>
            <div className="flex flex-wrap gap-2">
              {['02SCL','12LAS','17MAI','20CTC','16PQA','49PTA','29CFL','23PEÑ','34SMB','37VIN'].map(cod => (
                <button key={cod} onClick={() => selectStore(cod)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer transition-all active:scale-95 text-[12px] font-semibold"
                  style={{
                    borderColor: storeCod === cod ? '#D97706' : 'rgba(26,37,80,0.15)',
                    background: storeCod === cod ? 'rgba(217,119,6,0.10)' : 'white',
                    color: storeCod === cod ? '#D97706' : '#374151',
                  }}>
                  <span className="font-mono font-bold">{cod}</span>
                  <span className="text-text-3 text-[11px] hidden sm:inline">{getStoreName(cod)}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── PLANILLA VIEW ── */}
        {view === 'planilla' && (
          <>
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
                    Última actualización: {lastRefresh.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
              <button onClick={() => fetchOperations(storeCod)} disabled={loading}
                className="text-[12px] font-semibold cursor-pointer border rounded-full px-3 py-1.5 transition-all disabled:opacity-40"
                style={{ borderColor: 'rgba(217,119,6,0.4)', color: '#D97706', background: 'rgba(217,119,6,0.06)' }}>
                {loading ? '⏳' : '↻ Actualizar'}
              </button>
            </div>

            {error && (
              <div className="mt-2 text-[12px] text-red bg-white border border-[rgba(220,38,38,0.2)] rounded-card px-4 py-2">{error}</div>
            )}

            {pickerGroups.length === 0 && !loading && (
              <div className="mt-8 text-center">
                <div className="text-[40px] mb-3">📦</div>
                <div className="font-barlow-condensed text-[18px] font-bold text-text-2">Sin operaciones para hoy</div>
                <div className="text-[13px] text-text-3 mt-1">
                  No hay operaciones de picking {storeCod ? `para tienda ${storeCod}` : 'programadas para hoy'} en Odoo.
                </div>
                <button onClick={() => setView('search')}
                  className="mt-4 px-5 py-2.5 rounded-card font-barlow-condensed text-[15px] font-bold cursor-pointer border"
                  style={{ borderColor: 'rgba(217,119,6,0.4)', color: '#D97706', background: 'rgba(217,119,6,0.06)' }}>
                  Cambiar tienda
                </button>
              </div>
            )}

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
          </>
        )}
      </div>
    </div>
  );
}
