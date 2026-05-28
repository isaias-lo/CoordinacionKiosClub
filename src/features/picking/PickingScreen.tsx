'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { ProfilePill } from '@/components/ProfilePill';
import { getOdooConfig } from '@/features/auditoria/utils/odooApi';
import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';
import { refreshCalendario, subscribeToCalendarChanges } from '@/features/despacho/utils/useCalendario';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PickingOperation {
  id: number; name: string; origin: string; partner: string;
  fromLocation: string; toLocation: string; state: string;
  scheduledDate: string; dateDone: string | null; pickingType: string;
  responsible: string; responsibleId: number | null;
  categories: string[]; storeCodeFromOrigin: string; originDate: string;
  lineCount: number;
}
interface PickerGroup { key: string; storeCod: string; stateKey: string; operations: PickingOperation[]; }
interface TodayStore { cod: string; name: string; sources: ('rm' | 'regiones')[]; }
type StoreGroupKey = 'region' | 'costa' | 'santiago';
interface OdooConfig { url: string; db: string; username: string; apiKey: string; }

interface PickingSession {
  date: string;
  selectedCods: string[];
  opsMap: Record<string, PickingOperation[]>;
  pickerDisplayNames: Record<string, string>;
}

interface PalletSlot {
  id: number;
  store_cod: string;
  state_key: string;
  picker_label: string;
  tipo: string;
  contenido: string;
  refs: string;
  created_at: string;
}

function categoriesToContenido(cats: string[]): string {
  const low = cats.map(c => c.toLowerCase());
  const hasComida = low.some(c => c.includes('comida') || c.includes('food') || c.includes('aliment'));
  const hasHogar  = low.some(c => c.includes('hogar') || c.includes('home') || c.includes('bazar'));
  if (hasComida && hasHogar) return 'mixto';
  if (hasComida) return 'comida';
  return 'hogar';
}

interface PrintRecord {
  state_key: string;
  printed_at: string;
  picker_label: string;
  pallets: number;
  tipo: string;
}

interface SessionStateRow {
  state_key: string;
  picker_label: string;
  tipo: string;
}

const SAVED_NAMES_KEY     = 'picking_saved_picker_names';
const SESSION_KEY         = 'picking_session_v2';
const SECTION_FILTER_KEY  = 'picking_section_filter';
const COLS_PER_ROW_KEY    = 'picking_cols_per_row';
const STATS_CACHE_KEY     = 'picking_stats_cache_v1';
const PICKER_TYPES_KEY    = `picking_types_v1_${new Date().toISOString().slice(0, 10)}`;
const LABEL_CONFIG_KEY    = 'picking_label_config_v1';
const CANONICAL_NAMES_KEY = 'picking_canonical_names_v1';

type PickerType = 'P' | 'C' | 'B' | 'CH';

interface LabelConfig {
  borderWidth: number;           // 0–4
  pickerFontSize: number;        // 20–50
  storeFontSize: number;         // 80–200
  catFontSize: number;           // 12–30
  barcodeBarWidth: number;       // 1–4
  barcodeHeight: number;         // 40–130
  barcodeContainerWidth: number; // 60–100 (%)
  showResponsable: boolean;
  showCategories: boolean;
  showStoreName: boolean;
  // New controls
  dateFontSize: number;          // 8–20
  palletNumSize: number;         // 50–120
  storeNameFontSize: number;     // 24–72
  cornerRadius: number;          // 0–20
  showDate: boolean;
  slotIdFontSize: number;        // 10–28
}
const DEFAULT_LABEL_CONFIG: LabelConfig = {
  borderWidth: 2, pickerFontSize: 34, storeFontSize: 128, catFontSize: 22,
  barcodeBarWidth: 2, barcodeHeight: 113, barcodeContainerWidth: 85,
  showResponsable: true, showCategories: true, showStoreName: true,
  dateFontSize: 12, palletNumSize: 80, storeNameFontSize: 52, cornerRadius: 12, showDate: true,
  slotIdFontSize: 18,
};

const CANONICAL_PICKER_KEYS = [
  'Pickers 1','Pickers 2','Pickers 3','Pickers 4','Pickers 5',
  'Pickers 6','Pickers 7','Pickers 8','Pickers 9','Pickers 10',
  'Pickers 11','Pickers 12','Pickers 13','Pickers 14','Pickers 15',
  'Pickers 16','Pickers 17','Pickers 18','Adquisiciones','Calidad',
];
const AUTO_REFRESH_MS    = 3 * 60 * 1000; // 3 min

const STATS_DATE_FROM = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; })();
const STATS_DATE_TO   = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().slice(0,10); })();

type SectionFilter = 'all' | 'aseo-comida' | 'hogar';

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
  assigned:  { label: 'Preparado',  color: '#D97706', bg: 'rgba(217,119,6,0.10)', border: 'rgba(217,119,6,0.30)' },
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

// ─── Stats types & helpers ────────────────────────────────────────────────────

interface PickerStatRow {
  name: string; ops: number; totalMinutes: number; avgMinutesPerOp: number;
  units: number; lineCount: number; avgSecondsPerLine: number; cph: number;
}
interface StatsCache { cachedAt: string; rows: PickerStatRow[]; }

function fmtDuration(min: number): string {
  if (min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtSecs(sec: number): string {
  if (sec <= 0) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
function cphColor(cph: number): string {
  if (cph <= 0) return '#9CA3AF';
  if (cph >= 90) return '#16A34A';
  if (cph >= 60) return '#D97706';
  return '#DC2626';
}

// ─── Stats Tab ────────────────────────────────────────────────────────────────

type StatSortKey = keyof PickerStatRow;

function isAllowedPicker(name: string): boolean {
  const n = name.toLowerCase().trim();
  // Pickers 1–18
  const m = n.match(/^pickers?\s+(\d+)$/);
  if (m) { const num = parseInt(m[1]); return num >= 1 && num <= 18; }
  // Adquisiciones / Calidad
  return n.includes('adquisicion') || n.includes('adquisición') || n.includes('calidad');
}

const STAT_COLS: { key: StatSortKey; label: string; hint: string; right?: boolean }[] = [
  { key: 'name',             label: 'Nombre',           hint: 'Responsable de la operación' },
  { key: 'ops',              label: 'Ops',              hint: 'Operaciones completadas',        right: true },
  { key: 'totalMinutes',     label: 'T. Total',         hint: 'Tiempo total trabajado',         right: true },
  { key: 'avgMinutesPerOp',  label: 'Prom / Op',        hint: 'Tiempo promedio por operación',  right: true },
  { key: 'units',            label: 'Unidades',         hint: 'Unidades movidas (qty done)',    right: true },
  { key: 'avgSecondsPerLine',label: 'Prom / Pistolaz.', hint: 'Tiempo promedio entre pistolazos (total_time / líneas)', right: true },
  { key: 'cph',              label: 'CPH',              hint: 'Casos por hora',                 right: true },
];

function StatsTab({ odooConfig, hasOdoo }: { odooConfig: OdooConfig; hasOdoo: boolean }) {
  const [cache, setCache]     = useState<StatsCache | null>(() => {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem(STATS_CACHE_KEY) ?? 'null') as StatsCache | null; }
    catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<StatSortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const [dateFrom, setDateFrom] = useState(STATS_DATE_FROM);
  const [dateTo, setDateTo]     = useState(STATS_DATE_TO);
  const [pendingFrom, setPendingFrom] = useState(STATS_DATE_FROM);
  const [pendingTo, setPendingTo]     = useState(STATS_DATE_TO);
  const datesChanged = pendingFrom !== dateFrom || pendingTo !== dateTo;

  const loadStats = useCallback(async (fromOverride?: string, toOverride?: string) => {
    if (!hasOdoo) return;
    setLoading(true);
    setError(null);
    const from = fromOverride ?? dateFrom;
    const to   = toOverride   ?? dateTo;
    try {
      const res = await fetch('/api/odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'picking_stats_range', config: odooConfig, dateFrom: from, dateTo: to }),
        signal: AbortSignal.timeout(90_000),
      });
      const data = (await res.json()) as { stats?: PickerStatRow[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Error Odoo');
      const newCache: StatsCache = { cachedAt: new Date().toISOString(), rows: data.stats ?? [] };
      setCache(newCache);
      localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(newCache));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [hasOdoo, odooConfig, dateFrom, dateTo]);

  function applyDateChange() {
    const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
    if (!window.confirm(
      `¿Cambiar el período de estadísticas?\n\nNuevo rango: ${fmt(pendingFrom)} — ${fmt(pendingTo)}\n\nEsto borrará los datos en caché y cargará nuevas estadísticas.`
    )) return;
    setDateFrom(pendingFrom);
    setDateTo(pendingTo);
    setCache(null);
    localStorage.removeItem(STATS_CACHE_KEY);
    void loadStats(pendingFrom, pendingTo);
  }

  const sorted = useMemo(() => {
    if (!cache) return [];
    return cache.rows
      .filter(r => isAllowedPicker(r.name))
      .sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        const cmp = typeof av === 'string' ? (av as string).localeCompare(bv as string) : (av as number) - (bv as number);
        return sortAsc ? cmp : -cmp;
      });
  }, [cache, sortKey, sortAsc]);

  const handleSort = (key: StatSortKey) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(key === 'name'); }
  };

  const cachedAt = cache?.cachedAt
    ? new Date(cache.cachedAt).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  function exportStats() {
    if (!sorted.length) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
    const cphCss = (c: number) => c >= 90 ? 'cph-high' : c >= 60 ? 'cph-mid' : 'cph-low';
    const totCph = Math.round(sorted.reduce((s, r) => s + r.cph, 0) / (sorted.length || 1));
    const rows = sorted.map(r => `<tr>
<td class="name">${r.name}</td>
<td class="r">${r.ops}</td>
<td class="r">${fmtDuration(r.totalMinutes)}</td>
<td class="r">${fmtDuration(r.avgMinutesPerOp)}</td>
<td class="r">${r.units.toLocaleString('es-CL')}</td>
<td class="r">${fmtSecs(r.avgSecondsPerLine)}</td>
<td class="r"><span class="${cphCss(r.cph)}">${r.cph > 0 ? r.cph : '—'}</span></td>
</tr>`).join('');
    win.document.write(`<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8">
<title>Estadísticas Pickers</title>
<style>
@page{size:A4 landscape;margin:12mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#111}
header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #1B2A6B}
h1{font-size:20px;font-weight:900;color:#1B2A6B}
.sub{font-size:12px;color:#666;margin-top:3px}
.meta{font-size:11px;color:#999;text-align:right;line-height:1.6}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:linear-gradient(135deg,#1B2A6B,#2563EB);color:#fff;padding:8px 10px;font-weight:700;white-space:nowrap}
th.r,td.r{text-align:right}
td{padding:7px 10px;border-bottom:1px solid #E5E7EB}
td.name{font-weight:600;color:#1A2550}
td.r{font-family:monospace}
tr:nth-child(even) td{background:#FAFBFF}
tfoot td{background:rgba(26,37,80,0.06)!important;font-weight:700;border-top:2px solid rgba(26,37,80,0.15);color:#1A2550}
.cph-high{color:#16A34A;font-weight:900;background:rgba(22,163,74,0.12);padding:2px 8px;border-radius:6px;display:inline-block}
.cph-mid{color:#D97706;font-weight:900;background:rgba(217,119,6,0.12);padding:2px 8px;border-radius:6px;display:inline-block}
.cph-low{color:#DC2626;font-weight:900;background:rgba(220,38,38,0.10);padding:2px 8px;border-radius:6px;display:inline-block}
footer{margin-top:10px;font-size:10px;color:#999;text-align:right}
.print-btn{margin-top:14px;padding:8px 22px;background:#1B2A6B;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}
@media print{.print-btn{display:none}}
</style></head><body>
<header>
<div><h1>Estadísticas de Pickers — KiosClub Logística</h1>
<div class="sub">Período: ${fmt(dateFrom)} — ${fmt(dateTo)}</div></div>
<div class="meta">Generado: ${new Date().toLocaleString('es-CL')}<br>${sorted.length} pickers · ${sorted.reduce((s, r) => s + r.ops, 0)} operaciones</div>
</header>
<table>
<thead><tr>
<th>Nombre</th><th class="r">Ops</th><th class="r">T. Total</th><th class="r">Prom / Op</th>
<th class="r">Unidades</th><th class="r">Prom / Pistolaz.</th><th class="r">CPH</th>
</tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr>
<td>TOTAL / PROMEDIO</td>
<td class="r">${sorted.reduce((s, r) => s + r.ops, 0)}</td>
<td class="r">${fmtDuration(sorted.reduce((s, r) => s + r.totalMinutes, 0))}</td>
<td class="r">${fmtDuration(Math.round(sorted.reduce((s, r) => s + r.avgMinutesPerOp, 0) / (sorted.length || 1)))}</td>
<td class="r">${sorted.reduce((s, r) => s + r.units, 0).toLocaleString('es-CL')}</td>
<td class="r">${fmtSecs(Math.round(sorted.reduce((s, r) => s + r.avgSecondsPerLine, 0) / (sorted.length || 1)))}</td>
<td class="r"><span class="${cphCss(totCph)}">${totCph}</span></td>
</tr></tfoot>
</table>
<footer>KiosClub · Exportado el ${new Date().toLocaleString('es-CL')}</footer>
<button class="print-btn" onclick="window.print()">🖨 Imprimir</button>
</body></html>`);
    win.document.close();
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header bar */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="text-[16px] font-bold text-navy">Estadísticas de pickers</div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <input type="date" value={pendingFrom} onChange={e => setPendingFrom(e.target.value)}
                className="border border-border rounded-lg px-2 py-1 text-[13px] text-text bg-white outline-none focus:border-amber-400 cursor-pointer" />
              <span className="text-text-3 text-[13px]">—</span>
              <input type="date" value={pendingTo} onChange={e => setPendingTo(e.target.value)}
                className="border border-border rounded-lg px-2 py-1 text-[13px] text-text bg-white outline-none focus:border-amber-400 cursor-pointer" />
              {datesChanged && (
                <button onClick={applyDateChange}
                  className="px-3 py-1 rounded-lg text-[13px] font-bold cursor-pointer transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #1B2A6B, #2563EB)', color: '#fff' }}>
                  Aplicar
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {cachedAt && (
              <div className="text-[12px] text-text-3">
                Actualizado: <span className="font-semibold">{cachedAt}</span>
              </div>
            )}
            {sorted.length > 0 && (
              <button onClick={exportStats}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[14px] font-bold cursor-pointer transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg, #064E3B, #059669)', color: '#fff' }}>
                ↗ Exportar
              </button>
            )}
            <button
              onClick={() => void loadStats()}
              disabled={loading || !hasOdoo}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[14px] font-bold cursor-pointer transition-all active:scale-95 disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #78350F, #D97706)', color: '#fff' }}>
              {loading ? (
                <><span className="animate-spin inline-block">↻</span> Cargando…</>
              ) : (
                <>{cache ? '↻ Actualizar' : '⬇ Cargar datos'}</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-4">

        {!hasOdoo && (
          <div className="bg-white border border-[rgba(220,38,38,0.25)] rounded-xl px-4 py-3 text-[14px] text-red mb-4">
            <span className="font-bold">Odoo no configurado.</span> Configura las credenciales para cargar estadísticas.
          </div>
        )}
        {error && (
          <div className="bg-white border border-[rgba(220,38,38,0.25)] rounded-xl px-4 py-3 text-[14px] text-red mb-4">
            <span className="font-bold">Error:</span> {error}
          </div>
        )}
        {!cache && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-text-3">
            <div className="text-[48px] mb-4 opacity-30">📊</div>
            <div className="text-[15px] font-semibold text-text-2 mb-1">Sin datos cargados</div>
            <div className="text-[13px] text-center max-w-xs">
              Presiona <strong>Cargar datos</strong> para consultar las estadísticas del período.
              Los datos se guardan localmente hasta que presiones Actualizar.
            </div>
          </div>
        )}

        {cache && sorted.length > 0 && (
          <div className="bg-white rounded-2xl border border-border shadow-card" style={{ overflow: 'clip' }}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ background: 'linear-gradient(135deg, #1B2A6B, #2563EB)' }}>
                    {STAT_COLS.map(col => (
                      <th key={col.key}
                        onClick={() => handleSort(col.key)}
                        title={col.hint}
                        className="px-4 py-3 font-bold text-white cursor-pointer select-none whitespace-nowrap"
                        style={{ textAlign: col.right ? 'right' : 'left' }}>
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          {sortKey === col.key && <span className="text-amber-300">{sortAsc ? '▲' : '▼'}</span>}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, i) => (
                    <tr key={row.name}
                      className="border-b border-border transition-colors"
                      style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFF' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(217,119,6,0.05)')}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#FAFBFF')}>
                      <td className="px-4 py-3 font-semibold text-navy whitespace-nowrap">{row.name}</td>
                      <td className="px-4 py-3 text-right font-mono text-text-2">{row.ops}</td>
                      <td className="px-4 py-3 text-right font-mono text-text-2">{fmtDuration(row.totalMinutes)}</td>
                      <td className="px-4 py-3 text-right font-mono text-text-2">{fmtDuration(row.avgMinutesPerOp)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-navy">{row.units.toLocaleString('es-CL')}</td>
                      <td className="px-4 py-3 text-right font-mono text-text-2">{fmtSecs(row.avgSecondsPerLine)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-block font-black text-[15px] px-3 py-1 rounded-lg"
                          style={{ color: cphColor(row.cph), background: row.cph > 0 ? `${cphColor(row.cph)}18` : 'transparent' }}>
                          {row.cph > 0 ? row.cph : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'rgba(26,37,80,0.05)', borderTop: '2px solid rgba(26,37,80,0.12)' }}>
                    <td className="px-4 py-3 font-black text-navy text-[13px]">TOTAL / PROMEDIO</td>
                    <td className="px-4 py-3 text-right font-black text-navy font-mono">{sorted.reduce((s, r) => s + r.ops, 0)}</td>
                    <td className="px-4 py-3 text-right font-bold text-navy font-mono">{fmtDuration(sorted.reduce((s, r) => s + r.totalMinutes, 0))}</td>
                    <td className="px-4 py-3 text-right font-bold text-navy font-mono">{fmtDuration(Math.round(sorted.reduce((s, r) => s + r.avgMinutesPerOp, 0) / (sorted.length || 1)))}</td>
                    <td className="px-4 py-3 text-right font-black text-navy font-mono">{sorted.reduce((s, r) => s + r.units, 0).toLocaleString('es-CL')}</td>
                    <td className="px-4 py-3 text-right font-bold text-navy font-mono">{fmtSecs(Math.round(sorted.reduce((s, r) => s + r.avgSecondsPerLine, 0) / (sorted.length || 1)))}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-black text-[15px]" style={{ color: cphColor(Math.round(sorted.reduce((s, r) => s + r.cph, 0) / (sorted.length || 1))) }}>
                        {Math.round(sorted.reduce((s, r) => s + r.cph, 0) / (sorted.length || 1))}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-4 py-2 text-[11px] text-text-3 border-t border-border">
              {sorted.length} pickers · {sorted.reduce((s, r) => s + r.ops, 0)} operaciones · {sorted.reduce((s, r) => s + r.units, 0).toLocaleString('es-CL')} unidades
            </div>
          </div>
        )}

        {cache && sorted.length === 0 && !loading && (
          <div className="text-center py-12 text-text-3 text-[14px]">Sin operaciones registradas para el período.</div>
        )}

      </div>
    </div>
  );
}
// ─── 1D Barcode (Code128) ─────────────────────────────────────────────────────

function Barcode1D({ value, height = 65, barWidth = 2 }: { value: string; height?: number; barWidth?: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!svgRef.current || !value) return;
    import('jsbarcode').then(({ default: JsBarcode }) => {
      if (!svgRef.current) return;
      try {
        JsBarcode(svgRef.current, value, {
          format: 'CODE128', width: barWidth, height,
          displayValue: false, margin: 8,
          background: '#ffffff', lineColor: '#000000',
        });
      } catch {
        const safe = value.replace(/[^\x20-\x7E]/g, '');
        try { JsBarcode(svgRef.current!, safe, { format: 'CODE128', width: barWidth, height, displayValue: false, margin: 8 }); } catch { /* ignore */ }
      }
    });
  }, [value, height, barWidth]);
  return <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />;
}

// ─── Barcode Card — etiqueta 150mm × 100mm ────────────────────────────────────

function BarcodeCard({ value, palletNum, total, storeCod, pickerLabel, responsibleKey, allCategories, totalPickers, tipo = 'P', compact = false, labelConfig, slotId }: {
  value: string; palletNum: number; total: number;
  storeCod: string; pickerLabel: string; responsibleKey: string; allCategories: string[];
  totalPickers: number; tipo?: string; compact?: boolean; labelConfig?: LabelConfig; slotId?: number;
}) {
  const storeName = getStoreName(storeCod);
  const cfg = { ...DEFAULT_LABEL_CONFIG, ...labelConfig };

  // compact=true → vista previa en pantalla (valores fijos, no configurables)
  // compact=false → tarjeta de impresión (usa labelConfig)
  const s = compact ? {
    outerMaxW: 340, outerMargin: '0 auto 6px',
    innerPad: '8px 10px 6px', innerMinH: 155,
    respSize: 9, pickerSize: 13, subSize: 11,
    palletSize: 28, deSize: 10,
    catSize: 9, catPad: '2px 6px', catGap: 4, catRadius: 4,
    centerPad: '4px 0',
    storeCodeSize: 'clamp(36px, 7vw, 52px)', storeCodeLS: '2px',
    storeNameSize: 17, storeNameMT: 3,
    barMT: 4, barW: '88%', barH: 36, barBW: 2,
    footerFS: 7, footerDateFS: 9,
  } : {
    outerMaxW: 720, outerMargin: '0 auto 20px',
    innerPad: '20px 22px 14px', innerMinH: 480,
    respSize: 12, pickerSize: cfg.pickerFontSize, subSize: 15,
    palletSize: cfg.palletNumSize, deSize: 13,
    catSize: cfg.catFontSize, catPad: '4px 14px', catGap: 8, catRadius: 8,
    centerPad: '12px 0',
    storeCodeSize: `clamp(${Math.round(cfg.storeFontSize * 0.6)}px, 28vw, ${cfg.storeFontSize}px)`, storeCodeLS: '6px',
    storeNameSize: cfg.storeNameFontSize, storeNameMT: 10,
    barMT: 8, barW: `${cfg.barcodeContainerWidth}%`, barH: cfg.barcodeHeight, barBW: cfg.barcodeBarWidth,
    footerFS: 9, footerDateFS: cfg.dateFontSize,
  };

  return (
    <div
      className="picking-label bg-white overflow-hidden print:break-after-page print:rounded-none print:border-0"
      style={{
        maxWidth: s.outerMaxW, margin: s.outerMargin,
        border: `${compact ? 2 : cfg.borderWidth}px solid #E5E7EB`,
        borderRadius: compact ? 12 : cfg.cornerRadius,
      }}
    >
      <div className="flex flex-col" style={{ padding: s.innerPad, minHeight: s.innerMinH }}>

        {/* Top row */}
        <div className="flex items-start justify-between" style={{ marginBottom: compact ? 3 : 8 }}>
          <div className="min-w-0 flex-1 pr-3">
            {(!compact && cfg.showResponsable || compact) && (
              <div style={{ fontSize: s.respSize, color: '#D97706', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 1 }}>
                {responsibleKey}
              </div>
            )}
            <div style={{ fontSize: s.pickerSize, fontWeight: 800, color: '#111', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pickerLabel}
            </div>
            {!compact && (
              <div style={{ fontSize: s.subSize, color: '#888', marginTop: 4, fontWeight: 500 }}>
                {totalPickers} picker{totalPickers !== 1 ? 's' : ''} en tienda
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="font-barlow-condensed font-black text-amber-600 leading-none" style={{ fontSize: s.palletSize }}>
              {tipo}-{palletNum}
            </div>
            <div style={{ fontSize: s.deSize, color: '#aaa', textAlign: 'right', fontWeight: 600 }}>de {total}</div>
            {slotId != null && (
              <div style={{ fontSize: compact ? 10 : cfg.slotIdFontSize, fontWeight: 900, color: '#1A2550', textAlign: 'right', marginTop: compact ? 1 : 4, fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                #{slotId}
              </div>
            )}
          </div>
        </div>

        {/* Categorías */}
        {allCategories.length > 0 && (cfg.showCategories || compact) && (
          <div style={{ display: 'flex', gap: s.catGap, marginBottom: compact ? 3 : 8, flexWrap: 'wrap' }}>
            {allCategories.map(c => (
              <span key={c} style={{
                fontSize: s.catSize, fontWeight: 800, color: '#1A2550',
                background: 'rgba(26,37,80,0.09)', borderRadius: s.catRadius,
                padding: s.catPad, letterSpacing: '0.5px',
              }}>{c}</span>
            ))}
          </div>
        )}

        {/* Centro: código + nombre */}
        <div className="flex-1 flex flex-col items-center justify-center text-center" style={{ padding: s.centerPad }}>
          <div className="font-barlow-condensed font-black text-gray-900 tracking-widest uppercase leading-none"
            style={{ fontSize: s.storeCodeSize, letterSpacing: s.storeCodeLS }}>
            {storeCod}
          </div>
          {(cfg.showStoreName || compact) && (
            <div className="font-barlow-condensed font-semibold text-gray-600 uppercase tracking-wide"
              style={{ fontSize: s.storeNameSize, marginTop: s.storeNameMT }}>
              {storeName}
            </div>
          )}
        </div>

        {/* Código de barras */}
        <div style={{ marginTop: s.barMT }}>
          <div style={{ width: s.barW, margin: '0 auto' }}>
            <Barcode1D value={slotId != null ? String(slotId) : value} height={s.barH} barWidth={s.barBW} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            <div style={{ fontSize: s.footerFS, fontFamily: 'monospace', color: '#bbb', wordBreak: 'break-all', lineHeight: 1.2, flex: 1 }}>
              {slotId != null ? `ID #${slotId}` : value}
            </div>
            {(compact || cfg.showDate) && (
              <div style={{ fontSize: s.footerDateFS, fontWeight: 700, color: '#888', fontFamily: 'monospace', whiteSpace: 'nowrap', marginLeft: 6 }}>
                {new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Picker Group Card (split: form izquierda | barcodes derecha) ─────────────

function PickerGroupCard({ group, displayName, palletsByTipo, onNameChange, onTipoPalletsChange, onRefreshOp, onPrint, refreshingId, totalPickers, assignedNums, isPrinted, colsPerRow, onPrintSelected, slots, stickerBelow }: {
  group: PickerGroup; displayName: string; palletsByTipo: Record<string, number>;
  onNameChange: (v: string) => void; onTipoPalletsChange: (tipo: PickerType, n: number) => void;
  onRefreshOp: (op: PickingOperation) => void; onPrint: () => void; refreshingId: number | null;
  totalPickers: number;
  assignedNums: number[];
  isPrinted: boolean;
  colsPerRow: number;
  onPrintSelected: (palletNums: Set<number>) => void;
  slots: PalletSlot[];
  stickerBelow?: boolean;
}) {
  const allDone       = group.operations.every(o => o.state === 'done');
  const allCategories = [...new Set(group.operations.flatMap(o => o.categories))];
  const refs          = group.operations.map(o => o.name).join('+');
  const cats          = allCategories.join(',');
  // El nombre se incluye en el barcode. Si no se ingresó, usar el nombre Odoo (group.key)
  const pickerLabel   = displayName || group.key;
  const barcodePickerName = sanitizeForBarcode(pickerLabel);

  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const toggleIndex = (i: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const handlePrintSelected = () => {
    const nums = new Set([...selectedIndices].map(i => assignedNums[i]).filter(n => n !== undefined));
    onPrintSelected(nums);
    setSelectedIndices(new Set());
  };

  const borderColor = allDone || isPrinted
    ? 'rgba(22,163,74,0.45)'
    : 'rgba(26,37,80,0.12)';
  const shadow = allDone || isPrinted
    ? '0 2px 16px rgba(22,163,74,0.14)'
    : '0 1px 8px rgba(26,37,80,0.07)';

  return (
    <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor, boxShadow: shadow }}>

      {/* Card header */}
      <div className="px-5 py-3 border-b flex items-center justify-between"
        style={{
          background:  allDone || isPrinted ? 'rgba(22,163,74,0.05)' : 'rgba(26,37,80,0.02)',
          borderColor: allDone || isPrinted ? 'rgba(22,163,74,0.18)' : '#F0F2F5',
        }}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-[14px] font-bold text-navy bg-[rgba(26,37,80,0.09)] px-3 py-1 rounded-lg shrink-0">{group.key}</span>
          {displayName && <span className="text-[16px] font-semibold text-text truncate">{displayName}</span>}
          {allDone && <span className="text-[13px] font-bold text-[#16A34A] shrink-0">✓ Realizado</span>}
          {isPrinted && (
            <span className="text-[12px] font-bold shrink-0 px-2.5 py-0.5 rounded-full"
              style={{ background: 'rgba(22,163,74,0.15)', color: '#16A34A', border: '1px solid rgba(22,163,74,0.35)' }}>
              🖨 Ya impreso
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {allCategories.map(c => (
            <span key={c} className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(26,37,80,0.07)] text-navy">{c}</span>
          ))}
          <span className="text-[13px] text-text-3">{group.operations.length} op.</span>
        </div>
      </div>

      {/* Split body */}
      <div className={stickerBelow ? 'flex flex-col' : 'flex flex-col lg:flex-row'}>

        {/* LEFT: Form */}
        <div className={`${stickerBelow ? 'w-full border-b' : 'lg:w-[45%] border-b lg:border-b-0 lg:border-r'} p-5 border-gray-100 print:hidden space-y-4`}>

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
                  {op.lineCount > 0 && (
                    <div className="text-[12px] font-semibold mt-0.5" style={{ color: '#4B5563' }}>
                      {op.lineCount} línea{op.lineCount !== 1 ? 's' : ''}
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

          {/* 3 independent counters: P, C, B */}
          <div>
            <label className="text-[12px] font-bold text-text-3 uppercase tracking-wide block mb-2">Unidades</label>
            <div className="flex gap-2">
              {([
                { tipo: 'P'  as PickerType, label: 'Pallets',       color: '#1E3A8A' },
                { tipo: 'C'  as PickerType, label: 'Contenedores',  color: '#6B21A8' },
                { tipo: 'B'  as PickerType, label: 'Bultos',        color: '#065F46' },
                { tipo: 'CH' as PickerType, label: 'Chocolates',    color: '#92400E' },
              ]).map(({ tipo, label, color }) => {
                const count = palletsByTipo[tipo] ?? 0;
                return (
                  <div key={tipo} className="flex-1 flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl border transition-all"
                    style={{
                      borderColor: count > 0 ? color : 'rgba(26,37,80,0.12)',
                      background: count > 0 ? `${color}0D` : 'transparent',
                    }}>
                    <div className="text-[10px] font-bold uppercase tracking-wide leading-tight text-center"
                      style={{ color: count > 0 ? color : '#9CA3AF' }}>
                      {tipo}<br/><span className="text-[9px] font-semibold normal-case tracking-normal">{label}</span>
                    </div>
                    <div className="flex items-center gap-1 w-full justify-center">
                      <button
                        onClick={() => onTipoPalletsChange(tipo, Math.max(0, count - 1))}
                        className="w-7 h-7 rounded-full border font-bold text-[16px] flex items-center justify-center cursor-pointer transition-colors hover:bg-gray-100"
                        style={{ borderColor: 'rgba(26,37,80,0.15)', color: '#6B7280' }}>−</button>
                      <span className="w-7 text-center text-[22px] font-barlow-condensed font-bold leading-none"
                        style={{ color: count > 0 ? color : '#D1D5DB' }}>{count}</span>
                      <button
                        onClick={() => onTipoPalletsChange(tipo, count + 1)}
                        className="w-7 h-7 rounded-full border font-bold text-[16px] flex items-center justify-center cursor-pointer transition-colors"
                        style={{ borderColor: color, color: color, background: `${color}15` }}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT / BOTTOM: estado por op cuando hay pendientes / barcodes cuando todo done */}
        <div className={`${stickerBelow ? 'w-full border-t border-gray-100' : 'lg:w-[55%]'} p-4 bg-[#FAFAFA]`}>
          {!allDone ? (
            <div className="h-full min-h-[180px] flex flex-col gap-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[13px] font-bold text-amber-700">⚠ Operaciones pendientes</span>
                <span className="text-[11px] text-text-3">Completa todas para generar etiquetas</span>
              </div>
              {group.operations.map(op => {
                const info = STATE_INFO[op.state] ?? STATE_INFO.draft;
                return (
                  <div key={op.id} className="flex items-center gap-3 bg-white border rounded-xl px-4 py-3"
                    style={{ borderColor: info.border }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[13px] font-bold text-navy">{op.name}</span>
                        <StateBadge state={op.state} />
                        {op.lineCount > 0 && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(26,37,80,0.07)', color: '#374151' }}>
                            {op.lineCount} líneas
                          </span>
                        )}
                      </div>
                      {op.categories.length > 0 && (
                        <div className="text-[12px] text-text-3 mt-0.5">{op.categories.join(' · ')}</div>
                      )}
                    </div>
                    {op.state !== 'done' && (
                      <button onClick={() => onRefreshOp(op)} disabled={refreshingId === op.id}
                        className="text-[13px] shrink-0 border rounded-full px-2.5 py-1.5 cursor-pointer disabled:opacity-40"
                        style={{ borderColor: 'rgba(37,99,235,0.35)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                        {refreshingId === op.id ? '⏳' : '↻'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : assignedNums.length === 0 ? (
            <div className="h-full min-h-[180px] flex flex-col items-center justify-center gap-3 text-text-3">
              <div className="text-[40px] opacity-30">▊▊▊▊</div>
              <div className="text-[14px] text-center">Ingresa la cantidad de unidades<br/>para generar los códigos</div>
            </div>
          ) : (
            <div>
              <div className="print:hidden flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="text-[13px] font-semibold text-text-2">
                  {assignedNums.length} código{assignedNums.length !== 1 ? 's' : ''}
                  {selectedIndices.size > 0 && (
                    <span className="ml-2 text-[12px] font-normal text-blue-600">
                      · {selectedIndices.size} seleccionada{selectedIndices.size !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedIndices.size > 0 && (
                    <>
                      <button
                        onClick={() => setSelectedIndices(new Set())}
                        className="text-[12px] cursor-pointer px-3 py-1.5 rounded-xl border transition-all"
                        style={{ borderColor: 'rgba(37,99,235,0.3)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                        ✕ Limpiar
                      </button>
                      <button
                        onClick={handlePrintSelected}
                        className="flex items-center gap-1.5 text-[13px] font-bold cursor-pointer px-3 py-1.5 rounded-xl transition-all active:scale-95"
                        style={{ background: 'linear-gradient(135deg, #1E3A8A, #2563EB)', color: '#fff' }}>
                        🖨 Imprimir {selectedIndices.size}
                      </button>
                    </>
                  )}
                  <button onClick={onPrint}
                    className="flex items-center gap-1.5 text-[14px] font-bold cursor-pointer px-4 py-2 rounded-xl transition-all active:scale-95"
                    style={isPrinted
                      ? { background: 'rgba(22,163,74,0.12)', color: '#16A34A', border: '1px solid rgba(22,163,74,0.4)' }
                      : { background: 'linear-gradient(135deg, #78350F, #D97706)', color: '#fff' }}>
                    {isPrinted
                      ? '↺ Re-imprimir todas'
                      : selectedIndices.size > 0 ? '🖨 Todas' : '🖨 Imprimir'}
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                {assignedNums.map((pNum, i) => {
                  const isSelected = selectedIndices.has(i);
                  const slot       = slots[i];
                  const slotTipo   = (slot?.tipo as PickerType | undefined) ?? 'P';
                  const tipoTotal  = slots.filter(s => ((s.tipo as PickerType | undefined) ?? 'P') === slotTipo).length;
                  const itemWidth  = `calc((100% - ${(colsPerRow - 1) * 8}px) / ${colsPerRow})`;
                  return (
                    <div key={slot?.id ?? i}
                      style={{ width: itemWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {/* Barcode card — click to select */}
                      <div onClick={() => toggleIndex(i)}
                        style={{
                          position: 'relative', cursor: 'pointer', borderRadius: 10,
                          outline: isSelected ? '2.5px solid #2563EB' : '2.5px solid transparent',
                          transition: 'outline 0.15s',
                        }}>
                        <BarcodeCard
                          value={`${group.storeCod};${barcodePickerName};${refs};${slotTipo}${pNum};${cats}`}
                          palletNum={pNum}
                          total={tipoTotal}
                          storeCod={group.storeCod}
                          pickerLabel={pickerLabel}
                          responsibleKey={group.key}
                          allCategories={allCategories}
                          totalPickers={totalPickers}
                          tipo={slotTipo}
                          slotId={slot?.id}
                          compact
                        />
                        {isSelected && (
                          <div style={{
                            position: 'absolute', top: 6, right: 6,
                            width: 22, height: 22, borderRadius: '50%',
                            background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 2px 6px rgba(37,99,235,0.4)',
                          }}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Store List Panel ─────────────────────────────────────────────────────────

function StoreListPanel({ selectedCods, loadingCods, errorCods, opsMap, todayStores, storesLoading, onToggleStore }: {
  selectedCods: string[]; loadingCods: string[]; errorCods: string[];
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
                const hasError     = errorCods.includes(store.cod);
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
                    {hasError && !isLoading && (
                      <span className="text-[13px] shrink-0" title="Error al cargar — haz clic para reintentar">⚠️</span>
                    )}

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

// ─── Config Tab ───────────────────────────────────────────────────────────────

function PickerNameRow({ pickerKey, savedValue, onSave }: {
  pickerKey: string; savedValue: string;
  onSave: (key: string, val: string) => void;
}) {
  const [draft, setDraft] = useState(savedValue);
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');
  const isDirty = draft !== savedValue;

  useEffect(() => { setDraft(savedValue); }, [savedValue]);

  const save = () => {
    if (!isDirty) return;
    onSave(pickerKey, draft);
    setStatus('saved');
    setTimeout(() => setStatus('idle'), 2000);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#F1F5F9] last:border-b-0">
      <span className="font-mono text-[13px] font-bold text-navy w-24 shrink-0 truncate">{pickerKey}</span>
      <input
        type="text"
        value={draft}
        placeholder="Nombre…"
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
        className="flex-1 min-w-0 border rounded-lg px-2.5 py-1.5 text-[13px] bg-white outline-none transition-colors"
        style={{ borderColor: isDirty ? '#D97706' : status === 'saved' ? '#16A34A' : '#E2E8F0' }}
      />
      {isDirty ? (
        <button
          onClick={save}
          className="px-2.5 py-1 text-[12px] font-bold rounded-lg cursor-pointer transition-all active:scale-95 shrink-0"
          style={{ background: 'linear-gradient(135deg,#92400E,#D97706)', color: '#fff' }}>
          ✓
        </button>
      ) : status === 'saved' ? (
        <span className="text-[12px] font-bold shrink-0" style={{ color: '#16A34A' }}>✓</span>
      ) : <span className="w-8 shrink-0" />}
    </div>
  );
}

const CFG_SLIDER_CSS = `
  .cfg-slider{-webkit-appearance:none;appearance:none;height:2px;border-radius:9999px;outline:none;cursor:pointer;touch-action:none;padding:10px 0;box-sizing:content-box}
  .cfg-slider::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:2.5px solid #D97706;box-shadow:0 1px 6px rgba(217,119,6,.40);cursor:pointer;transition:box-shadow .12s,transform .12s;margin-top:-9px}
  .cfg-slider::-webkit-slider-thumb:hover{box-shadow:0 1px 6px rgba(217,119,6,.40),0 0 0 6px rgba(217,119,6,.12);transform:scale(1.1)}
  .cfg-slider::-webkit-slider-thumb:active{transform:scale(1.2);box-shadow:0 2px 10px rgba(217,119,6,.45),0 0 0 8px rgba(217,119,6,.10)}
  .cfg-slider::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#fff;border:2.5px solid #D97706;cursor:pointer;box-shadow:0 1px 6px rgba(217,119,6,.40)}
  .cfg-slider::-webkit-slider-runnable-track{height:2px;border-radius:9999px}
  .cfg-slider::-moz-range-track{height:2px;border-radius:9999px}
  .cfg-num::-webkit-inner-spin-button,.cfg-num::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
  .cfg-num{-moz-appearance:textfield}
`;

// ─── TurnoSummary ─────────────────────────────────────────────────────────────

function TurnoSummary({
  allGroups, pickerPallets, printedKeys, selectedCods,
}: {
  allGroups: PickerGroup[];
  pickerPallets: Record<string, number>;
  printedKeys: Set<string>;
  selectedCods: string[];
}) {
  const realGroups   = allGroups.filter(g => g.key !== 'Sin asignar');
  const totalPickers = realGroups.length;
  const printedCount = realGroups.filter(g => printedKeys.has(g.stateKey)).length;
  const totalPallets = realGroups.reduce((s, g) => s + (pickerPallets[g.stateKey] ?? 0), 0);
  const pct = totalPickers > 0 ? Math.round((printedCount / totalPickers) * 100) : 0;

  if (totalPickers === 0) return null;

  return (
    <div className="mx-4 mt-3 mb-1 rounded-2xl overflow-hidden print:hidden flex-shrink-0"
      style={{ background: '#fff', border: '1px solid rgba(26,37,80,0.1)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div className="flex items-center gap-4 px-4 pt-3 pb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[13px] font-bold" style={{ color: '#1A2550' }}>
              {printedCount}<span className="font-normal" style={{ color: '#9CA3AF' }}>/{totalPickers}</span> pickers impresos
            </span>
            <span className="text-[12px] font-bold" style={{ color: pct === 100 ? '#16A34A' : '#D97706' }}>
              {pct}%
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: '#F1F5F9' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: pct === 100
                  ? 'linear-gradient(90deg,#16A34A,#22C55E)'
                  : 'linear-gradient(90deg,#D97706,#F59E0B)',
              }} />
          </div>
        </div>
        <div className="shrink-0 text-right border-l pl-4" style={{ borderColor: '#F1F5F9' }}>
          <div className="text-[22px] font-black leading-none" style={{ color: '#1A2550' }}>{totalPallets}</div>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: '#9CA3AF' }}>pallets</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {selectedCods.map(cod => {
          const groups = realGroups.filter(g => g.storeCod === cod);
          const allPrinted  = groups.length > 0 && groups.every(g => printedKeys.has(g.stateKey));
          const somePrinted = groups.some(g => printedKeys.has(g.stateKey));
          const dotColor = allPrinted ? '#16A34A' : somePrinted ? '#D97706' : '#CBD5E1';
          const bg = allPrinted ? 'rgba(22,163,74,0.1)' : somePrinted ? 'rgba(217,119,6,0.1)' : 'rgba(26,37,80,0.05)';
          const border = allPrinted ? 'rgba(22,163,74,0.3)' : somePrinted ? 'rgba(217,119,6,0.3)' : 'rgba(26,37,80,0.1)';
          const color  = allPrinted ? '#16A34A' : somePrinted ? '#92400E' : '#9CA3AF';
          return (
            <div key={cod} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold"
              style={{ background: bg, border: `1px solid ${border}`, color }}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
              {cod}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── HistorialTab ──────────────────────────────────────────────────────────────

function HistorialTab({ allGroups }: { allGroups: PickerGroup[] }) {
  const [records, setRecords]   = useState<PrintRecord[]>([]);
  const [loading, setLoading]   = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/picking-prints?date=${todayISO()}`);
      const json = await res.json() as { data?: PrintRecord[] };
      const sorted = [...(json.data ?? [])].sort(
        (a, b) => new Date(a.printed_at).getTime() - new Date(b.printed_at).getTime()
      );
      setRecords(sorted);
      setLoadedAt(new Date());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useRealtimeRefresh('picking_prints', load);

  // Lookup categorías desde allGroups (cargados en memoria esta sesión)
  const catsByKey = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const g of allGroups) {
      const cats = [...new Set(g.operations.flatMap(o => o.categories))].filter(Boolean);
      if (cats.length) map[g.stateKey] = cats;
    }
    return map;
  }, [allGroups]);

  const totalPallets  = records.reduce((s, r) => s + r.pallets, 0);
  const uniquePickers = new Set(records.map(r => r.picker_label)).size;
  const uniqueStores  = new Set(records.map(r => r.state_key.split('__')[0])).size;

  // Resumen por tienda: { cod → { pallets, cats } }
  const byStore = useMemo(() => {
    const map: Record<string, { pallets: number; cats: Set<string> }> = {};
    for (const r of records) {
      const cod = r.state_key.split('__')[0];
      if (!map[cod]) map[cod] = { pallets: 0, cats: new Set() };
      map[cod].pallets += r.pallets;
      (catsByKey[r.state_key] ?? []).forEach(c => map[cod].cats.add(c));
    }
    return map;
  }, [records, catsByKey]);

  const CAT_COLOR: Record<string, { bg: string; color: string; border: string }> = {
    Comida: { bg: 'rgba(22,163,74,0.1)',   color: '#15803D', border: 'rgba(22,163,74,0.3)' },
    Aseo:   { bg: 'rgba(37,99,235,0.1)',   color: '#1D4ED8', border: 'rgba(37,99,235,0.3)' },
    Hogar:  { bg: 'rgba(217,119,6,0.1)',   color: '#92400E', border: 'rgba(217,119,6,0.3)' },
  };

  function CatPills({ cats }: { cats: string[] }) {
    if (!cats.length) return <span style={{ color: '#CBD5E1' }}>—</span>;
    return (
      <span className="flex flex-wrap gap-1">
        {cats.map(c => {
          const s = CAT_COLOR[c] ?? { bg: 'rgba(107,114,128,0.1)', color: '#6B7280', border: 'rgba(107,114,128,0.2)' };
          return (
            <span key={c} className="px-1.5 py-0.5 rounded-full text-[11px] font-bold"
              style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
              {c}
            </span>
          );
        })}
      </span>
    );
  }

  function exportHistorial() {
    if (!records.length) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const rows = records.map((r, i) => {
      const hora    = new Date(r.printed_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
      const tienda  = r.state_key.split('__')[0];
      const tipo    = r.tipo === 'C' ? 'Contenedor' : r.tipo === 'B' ? 'Bulto' : r.tipo === 'CH' ? 'Chocolate' : 'Pallet';
      const cats    = (catsByKey[r.state_key] ?? []).join(', ') || '—';
      return `<tr class="${i % 2 === 0 ? '' : 'alt'}">
<td class="mono">${hora}</td><td>${r.picker_label}</td>
<td class="mono">${tienda}</td><td>${cats}</td>
<td class="r">${r.pallets}</td><td>${tipo}</td></tr>`;
    }).join('');
    const storeRows = Object.entries(byStore).map(([cod, { pallets, cats }]) =>
      `<tr><td class="mono cod">${cod}</td><td>${[...cats].join(', ') || '—'}</td><td class="r big">${pallets}</td></tr>`
    ).join('');
    win.document.write(`<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8"><title>Historial del día — Picking</title>
<style>
@page{size:A4 landscape;margin:12mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;font-size:13px;color:#111}
header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #1B2A6B}
h1{font-size:20px;font-weight:900;color:#1B2A6B}.sub{font-size:12px;color:#666;margin-top:3px}
.meta{font-size:11px;color:#999;text-align:right;line-height:1.6}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:linear-gradient(135deg,#1B2A6B,#2563EB);color:#fff;padding:8px 10px;font-weight:700}
th.r,td.r{text-align:right}td{padding:7px 10px;border-bottom:1px solid #E5E7EB}
tr.alt td{background:#FAFBFF}
tfoot td{background:rgba(26,37,80,0.06)!important;font-weight:700;border-top:2px solid rgba(26,37,80,0.15);color:#1A2550}
.mono{font-family:monospace}.cod{font-weight:900;color:#1A2550}
.big{font-size:15px;font-weight:900;color:#1A2550}
h2{font-size:15px;font-weight:800;color:#1B2A6B;margin:18px 0 6px}
footer{margin-top:10px;font-size:10px;color:#999;text-align:right}
.print-btn{margin-top:14px;padding:8px 22px;background:#1B2A6B;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}
@media print{.print-btn{display:none}}
</style></head><body><header>
<div><h1>Historial del día — Picking</h1>
<div class="sub">${new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
<div class="meta">Generado: ${new Date().toLocaleString('es-CL')}<br>${records.length} impresión${records.length !== 1 ? 'es' : ''} · ${totalPallets} pallets</div>
</header>
<table><thead><tr>
<th>Hora</th><th>Picker</th><th>Tienda</th><th>Contenido</th><th class="r">Pallets</th><th>Tipo</th>
</tr></thead><tbody>${rows}</tbody><tfoot><tr>
<td colspan="4"><strong>TOTAL</strong> · ${records.length} impresión${records.length !== 1 ? 'es' : ''} · ${uniquePickers} pickers · ${uniqueStores} tiendas</td>
<td class="r">${totalPallets}</td><td></td>
</tr></tfoot></table>
<h2>Resumen por tienda</h2>
<table><thead><tr><th>Tienda</th><th>Contenido</th><th class="r">Pallets</th></tr></thead>
<tbody>${storeRows}</tbody></table>
<footer>KiosClub · Exportado el ${new Date().toLocaleString('es-CL')}</footer>
<button class="print-btn" onclick="window.print()">🖨 Imprimir</button>
</body></html>`);
    win.document.close();
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b" style={{ borderColor: '#F0F2F5' }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[16px] font-bold" style={{ color: '#1A2550' }}>Historial del día</div>
            {loadedAt && (
              <div className="text-[12px] mt-0.5" style={{ color: '#9CA3AF' }}>
                Actualizado: {loadedAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => void load()} disabled={loading}
              className="text-[13px] font-semibold border rounded-full px-3 py-1.5 cursor-pointer transition-all disabled:opacity-40"
              style={{ borderColor: 'rgba(217,119,6,0.4)', color: '#D97706', background: 'rgba(217,119,6,0.06)' }}>
              {loading ? '⏳' : '↻ Actualizar'}
            </button>
            {records.length > 0 && (
              <button onClick={exportHistorial}
                className="text-[13px] font-bold px-3 py-1.5 rounded-full cursor-pointer"
                style={{ background: 'linear-gradient(135deg,#1B2A6B,#2563EB)', color: '#fff' }}>
                🖨 Exportar
              </button>
            )}
          </div>
        </div>
        {records.length > 0 && (
          <div className="flex gap-3 mt-3 flex-wrap">
            {([
              { label: 'Impresiones', value: records.length },
              { label: 'Pickers',     value: uniquePickers },
              { label: 'Tiendas',     value: uniqueStores },
              { label: 'Pallets',     value: totalPallets },
            ]).map(({ label, value }) => (
              <div key={label} className="text-center px-3 py-1.5 rounded-xl"
                style={{ background: 'rgba(26,37,80,0.06)', border: '1px solid rgba(26,37,80,0.1)' }}>
                <div className="text-[18px] font-black leading-tight" style={{ color: '#1A2550' }}>{value}</div>
                <div className="text-[11px] uppercase tracking-wide" style={{ color: '#9CA3AF' }}>{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {loading && records.length === 0 ? (
          <div className="text-center py-16 text-[14px]" style={{ color: '#9CA3AF' }}>Cargando…</div>
        ) : records.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-[52px] mb-3">📭</div>
            <div className="text-[16px] font-bold" style={{ color: '#6B7280' }}>Sin impresiones hoy</div>
            <div className="text-[13px] mt-1" style={{ color: '#9CA3AF' }}>Los registros aparecerán aquí cuando se impriman etiquetas</div>
          </div>
        ) : (
          <>
          {/* Tabla principal */}
          <div className="mt-4 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(26,37,80,0.1)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg,#1B2A6B,#2563EB)', color: '#fff' }}>
                  <th className="text-left px-4 py-3 font-bold">Hora</th>
                  <th className="text-left px-4 py-3 font-bold">Picker</th>
                  <th className="text-left px-4 py-3 font-bold">Tienda</th>
                  <th className="text-left px-4 py-3 font-bold">Contenido</th>
                  <th className="text-right px-4 py-3 font-bold">Pallets</th>
                  <th className="text-center px-4 py-3 font-bold">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFF', borderBottom: '1px solid #F1F5F9' }}>
                    <td className="px-4 py-2.5 font-mono text-[12px]" style={{ color: '#9CA3AF' }}>
                      {new Date(r.printed_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-2.5 font-semibold" style={{ color: '#1A2550' }}>{r.picker_label}</td>
                    <td className="px-4 py-2.5 font-mono font-bold" style={{ color: '#4B5563' }}>
                      {r.state_key.split('__')[0]}
                    </td>
                    <td className="px-4 py-2.5">
                      <CatPills cats={catsByKey[r.state_key] ?? []} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold" style={{ color: '#1A2550' }}>{r.pallets}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                        style={{
                          background: r.tipo === 'C' ? 'rgba(107,33,168,0.1)' : r.tipo === 'B' ? 'rgba(6,95,70,0.1)' : r.tipo === 'CH' ? 'rgba(120,53,15,0.1)' : 'rgba(30,58,138,0.1)',
                          color: r.tipo === 'C' ? '#6B21A8' : r.tipo === 'B' ? '#065F46' : r.tipo === 'CH' ? '#92400E' : '#1E3A8A',
                          border: `1px solid ${r.tipo === 'C' ? 'rgba(107,33,168,0.25)' : r.tipo === 'B' ? 'rgba(6,95,70,0.25)' : r.tipo === 'CH' ? 'rgba(120,53,15,0.25)' : 'rgba(30,58,138,0.2)'}`,
                        }}>
                        {r.tipo === 'C' ? 'Cont.' : r.tipo === 'B' ? 'Bulto' : r.tipo === 'CH' ? 'Choc.' : 'Pallet'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'rgba(26,37,80,0.06)', borderTop: '2px solid rgba(26,37,80,0.15)' }}>
                  <td className="px-4 py-3 font-bold" colSpan={4} style={{ color: '#1A2550' }}>
                    TOTAL · {records.length} impresión{records.length !== 1 ? 'es' : ''}
                  </td>
                  <td className="px-4 py-3 text-right font-black text-[15px]" style={{ color: '#1A2550' }}>{totalPallets}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Resumen por tienda */}
          <div className="mt-5 mb-2">
            <div className="text-[12px] font-bold uppercase tracking-widest mb-2" style={{ color: '#9CA3AF' }}>Resumen por tienda</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {Object.entries(byStore).map(([cod, { pallets, cats }]) => (
                <div key={cod} className="rounded-xl px-3 py-2.5"
                  style={{ background: '#fff', border: '1px solid rgba(26,37,80,0.1)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="font-mono font-black text-[15px]" style={{ color: '#1A2550' }}>{cod}</span>
                    <span className="font-black text-[20px] leading-none" style={{ color: '#1A2550' }}>{pallets}</span>
                  </div>
                  <div className="text-[10px] font-semibold mb-1.5" style={{ color: '#9CA3AF' }}>pallets</div>
                  <CatPills cats={[...cats]} />
                </div>
              ))}
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── PropRow — defined at module level so React never unmounts it mid-drag ─────

function PropRow({ label, field, min, max, unit = 'px', labelConfig, onUpdate }: {
  label: string; field: keyof LabelConfig; min: number; max: number; unit?: string;
  labelConfig: LabelConfig; onUpdate: (f: keyof LabelConfig, v: number | boolean) => void;
}) {
  const committed = labelConfig[field] as number;
  const rangeRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);

  // Sync slider + gradient when committed value changes from outside (± buttons, reset)
  useEffect(() => {
    if (dragging.current || !rangeRef.current) return;
    rangeRef.current.value = String(committed);
    const pct = ((committed - min) / (max - min) * 100).toFixed(1);
    rangeRef.current.style.background = `linear-gradient(to right,#D97706 ${pct}%,#E2E8F0 ${pct}%)`;
  }, [committed, min, max]);

  return (
    <div className="flex items-center gap-2 py-2 border-b border-[#F8FAFC] last:border-0">
      <span className="text-[11px] font-medium text-[#64748B] w-28 shrink-0 leading-tight">{label}</span>
      <input
        ref={rangeRef}
        type="range" min={min} max={max} step={0.01}
        defaultValue={committed}
        className="cfg-slider flex-1 min-w-0"
        onPointerDown={() => { dragging.current = true; }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        onChange={e => {
          const v = Number(e.target.value);
          const pct = ((v - min) / (max - min) * 100).toFixed(1);
          e.target.style.background = `linear-gradient(to right,#D97706 ${pct}%,#E2E8F0 ${pct}%)`;
          onUpdate(field, Math.round(v));
        }}
      />
      <div className="flex items-center shrink-0 rounded-lg overflow-hidden"
        style={{ border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
        <button
          onClick={() => committed > min && onUpdate(field, committed - 1)}
          className="w-6 h-6 flex items-center justify-center text-[14px] leading-none text-[#94A3B8] hover:bg-[#F1F5F9] cursor-pointer transition-colors"
          style={{ borderRight: '1px solid #E2E8F0' }}>−</button>
        <input
          type="number" min={min} max={max} value={committed}
          className="cfg-num w-9 text-center text-[12px] font-mono font-semibold text-[#0F172A] bg-transparent outline-none border-none py-0"
          onChange={e => { const n = Math.min(max, Math.max(min, parseInt(e.target.value) || min)); onUpdate(field, n); }}
        />
        <button
          onClick={() => committed < max && onUpdate(field, committed + 1)}
          className="w-6 h-6 flex items-center justify-center text-[14px] leading-none text-[#94A3B8] hover:bg-[#F1F5F9] cursor-pointer transition-colors"
          style={{ borderLeft: '1px solid #E2E8F0' }}>+</button>
      </div>
      {unit && <span className="text-[10px] text-[#CBD5E1] w-4 shrink-0 font-medium">{unit}</span>}
    </div>
  );
}

// ─── ConfigTab ─────────────────────────────────────────────────────────────────

function ConfigTab({ labelConfig, onLabelConfigChange, canonicalNames, onCanonicalNamesChange, colsPerRow, onColsPerRowChange }: {
  labelConfig: LabelConfig;
  onLabelConfigChange: (cfg: LabelConfig) => void;
  canonicalNames: Record<string, string>;
  onCanonicalNamesChange: (names: Record<string, string>, changedKey?: string, changedVal?: string) => void;
  colsPerRow: number;
  onColsPerRowChange: (n: number) => void;
}) {
  const previewScale = 0.50;
  const previewH = Math.round(600 * previewScale);

  const upd = (field: keyof LabelConfig, val: number | boolean) =>
    onLabelConfigChange({ ...labelConfig, [field]: val });

  function ToggleRow({ label, desc, field }: {
    label: string; desc?: string;
    field: 'showResponsable' | 'showCategories' | 'showStoreName' | 'showDate';
  }) {
    const val = labelConfig[field];
    return (
      <div className="flex items-center justify-between py-2 border-b border-[#F8FAFC] last:border-0 gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-[#334155] leading-tight">{label}</div>
          {desc && <div className="text-[10px] text-[#94A3B8] mt-0.5">{desc}</div>}
        </div>
        <button
          onClick={() => upd(field, !val)}
          className="relative flex items-center rounded-full cursor-pointer transition-colors duration-200 shrink-0"
          style={{ width: 36, height: 20, background: val ? '#D97706' : '#CBD5E1' }}>
          <span
            className="absolute bg-white rounded-full shadow-sm transition-all duration-200"
            style={{ width: 14, height: 14, left: val ? '19px' : '3px' }}
          />
        </button>
      </div>
    );
  }

  function PanelLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
      <div className="flex items-center gap-2 pt-3 pb-1.5 first:pt-0">
        <span className="text-[#94A3B8] flex items-center">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#94A3B8]">{label}</span>
        <div className="flex-1 h-px bg-[#F1F5F9]" />
      </div>
    );
  }

  const handleNameSave = (key: string, val: string) => {
    const next = { ...canonicalNames };
    if (val.trim()) next[key] = val.trim(); else delete next[key];
    onCanonicalNamesChange(next, key, val.trim());
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CFG_SLIDER_CSS }} />
      <div className="flex-1 overflow-y-auto px-4 pb-10">

        {/* ── Sección 1: Etiqueta de impresión ── */}
        <div className="mt-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[16px] font-bold text-navy leading-tight">Etiqueta de impresión</div>
              <div className="text-[12px] text-[#94A3B8] mt-0.5">Personaliza el diseño de las etiquetas generadas</div>
            </div>
            <button
              onClick={() => onLabelConfigChange({ ...DEFAULT_LABEL_CONFIG })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-xl cursor-pointer transition-all active:scale-95"
              style={{ color: '#64748B', background: '#F1F5F9', border: '1px solid #E2E8F0' }}>
              ↺ Restablecer
            </button>
          </div>

          {/* 3-column layout: Panel A | Preview central | Panel B */}
          <div className="flex flex-col lg:flex-row gap-3 items-start">

            {/* Panel A — Tipografía */}
            <div className="flex-1 bg-white rounded-2xl px-4 py-3 min-w-0" style={{ border: '1px solid #E2E8F0' }}>
              <PanelLabel icon={
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2h3v8H2zM7 5h3v5H7z" fill="currentColor"/></svg>
              } label="Tipografía" />
              <PropRow label="Picker" field="pickerFontSize" min={20} max={50} labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="N.º pallet (P-1)" field="palletNumSize" min={50} max={120} labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Código (#)" field="slotIdFontSize" min={10} max={28} labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Cód. tienda" field="storeFontSize" min={80} max={200} labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Nombre tienda" field="storeNameFontSize" min={24} max={72} labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Categorías" field="catFontSize" min={12} max={30} labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Fecha" field="dateFontSize" min={8} max={20} labelConfig={labelConfig} onUpdate={upd} />
            </div>

            {/* Preview central */}
            <div className="lg:w-[380px] flex-shrink-0 self-start sticky top-4">
              <div className="bg-white rounded-2xl p-4 flex flex-col items-center gap-3" style={{ border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(26,37,80,0.07)' }}>
                <div className="flex items-center justify-between self-stretch">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#D97706' }} />
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#94A3B8]">Vista previa</span>
                  </div>
                  <span className="text-[10px] text-[#CBD5E1]">{Math.round(previewScale * 100)}%</span>
                </div>
                <div className="w-full overflow-hidden rounded-lg" style={{ height: previewH, background: '#F8FAFC', position: 'relative' }}>
                  <div style={{
                    transform: `scale(${previewScale})`,
                    transformOrigin: 'top center',
                    width: 720,
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    marginLeft: -360,
                    pointerEvents: 'none',
                  }}>
                    <BarcodeCard
                      value="17MAI;JuanPerez;WH/PICK/1234;P1;Comida,Aseo"
                      palletNum={1} total={3} slotId={419}
                      storeCod="17MAI" pickerLabel="Juan Pérez" responsibleKey="Pickers 1"
                      allCategories={['Comida', 'Aseo']} totalPickers={4}
                      compact={false} labelConfig={labelConfig}
                    />
                  </div>
                </div>
                <div className="self-stretch text-[10px] text-[#CBD5E1] text-center">
                  Cambios en tiempo real
                </div>
              </div>
            </div>

            {/* Panel B — Barcode, Forma, Visibilidad */}
            <div className="flex-1 bg-white rounded-2xl px-4 py-3 min-w-0" style={{ border: '1px solid #E2E8F0' }}>
              <PanelLabel icon={
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="0" y="1" width="1.5" height="10"/><rect x="2.5" y="1" width="1" height="10"/><rect x="4.5" y="1" width="2" height="10"/><rect x="7.5" y="1" width="1" height="10"/><rect x="9.5" y="1" width="1.5" height="10"/></svg>
              } label="Código de barras" />
              <PropRow label="Grosor barras" field="barcodeBarWidth" min={1} max={4} unit="" labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Altura" field="barcodeHeight" min={40} max={130} labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Ancho" field="barcodeContainerWidth" min={60} max={100} unit="%" labelConfig={labelConfig} onUpdate={upd} />

              <PanelLabel icon={
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.5"/></svg>
              } label="Forma" />
              <PropRow label="Borde grosor" field="borderWidth" min={0} max={4} labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Radio esquinas" field="cornerRadius" min={0} max={20} labelConfig={labelConfig} onUpdate={upd} />

              <PanelLabel icon={
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><ellipse cx="6" cy="6" rx="5" ry="3.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="6" cy="6" r="1.5" fill="currentColor"/></svg>
              } label="Visibilidad" />
              <ToggleRow label="Responsable" desc="ej. Pickers 3" field="showResponsable" />
              <ToggleRow label="Categorías" desc="Comida · Aseo · Hogar" field="showCategories" />
              <ToggleRow label="Nombre tienda" desc="Texto bajo el código" field="showStoreName" />
              <ToggleRow label="Fecha impresión" field="showDate" />
            </div>

          </div>
        </div>

        {/* ── Sección 2: Nombres de pickers ── */}
        <div className="mb-6">
          <div className="mb-4">
            <div className="text-[16px] font-bold text-navy leading-tight">Nombres de pickers</div>
            <div className="text-[12px] text-[#94A3B8] mt-0.5">Se aplican automáticamente al asignar operaciones</div>
          </div>
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
            <div className="flex flex-col sm:flex-row">
              <div className="flex-1 sm:border-r" style={{ borderColor: '#E2E8F0' }}>
                {CANONICAL_PICKER_KEYS.slice(0, 7).map(key => (
                  <PickerNameRow key={key} pickerKey={key} savedValue={canonicalNames[key] ?? ''} onSave={handleNameSave} />
                ))}
              </div>
              <div className="flex-1 sm:border-r" style={{ borderColor: '#E2E8F0' }}>
                {CANONICAL_PICKER_KEYS.slice(7, 14).map(key => (
                  <PickerNameRow key={key} pickerKey={key} savedValue={canonicalNames[key] ?? ''} onSave={handleNameSave} />
                ))}
              </div>
              <div className="flex-1">
                {CANONICAL_PICKER_KEYS.slice(14).map(key => (
                  <PickerNameRow key={key} pickerKey={key} savedValue={canonicalNames[key] ?? ''} onSave={handleNameSave} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Sección 3: Vista en pantalla ── */}
        <div className="mb-6">
          <div className="mb-4">
            <div className="text-[16px] font-bold text-navy leading-tight">Vista en pantalla</div>
            <div className="text-[12px] text-[#94A3B8] mt-0.5">Ajusta la densidad del monitoreo</div>
          </div>
          <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E2E8F0' }}>
            <div className="text-[12px] font-semibold text-[#64748B] mb-3">Etiquetas por fila en monitoreo</div>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => onColsPerRowChange(n)}
                  className="w-10 h-10 rounded-xl text-[14px] font-bold cursor-pointer transition-all active:scale-95"
                  style={{
                    background: colsPerRow === n ? 'linear-gradient(135deg,#1E3A8A,#2563EB)' : '#F1F5F9',
                    color: colsPerRow === n ? '#fff' : '#94A3B8',
                    border: `1.5px solid ${colsPerRow === n ? 'rgba(37,99,235,0.4)' : '#E2E8F0'}`,
                  }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
    </>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function PickingScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  const odooConfig: OdooConfig = getOdooConfig() ?? { url: '', db: '', username: '', apiKey: '' };
  const hasOdoo = !!odooConfig.url;

  const [panelView, setPanelView] = useState<'stores' | 'planilla'>('stores');
  const [rightTab, setRightTab]   = useState<'monitoreo' | 'estadisticas' | 'historial' | 'configuracion'>('monitoreo');

  // Restaurar sesión al montar
  const session = useMemo(() => loadSession(), []);

  const [selectedCods, setSelectedCods] = useState<string[]>(session.selectedCods ?? []);
  const [opsMap, setOpsMap]             = useState<Record<string, PickingOperation[]>>(session.opsMap ?? {});
  const [loadingCods, setLoadingCods]   = useState<string[]>([]);
  const [lastRefresh, setLastRefresh]   = useState<Date | null>(null);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [todayStores, setTodayStores]   = useState<TodayStore[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);

  const [sectionFilter, setSectionFilter] = useState<SectionFilter>(() => {
    if (typeof window === 'undefined') return 'all';
    return (localStorage.getItem(SECTION_FILTER_KEY) as SectionFilter) ?? 'all';
  });

  const [colsPerRow, setColsPerRow] = useState<number>(() => {
    if (typeof window === 'undefined') return 3;
    return Number(localStorage.getItem(COLS_PER_ROW_KEY) ?? '3');
  });

  const [pickerTypes] = useState<Record<string, PickerType>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(PICKER_TYPES_KEY) ?? '{}') as Record<string, PickerType>; }
    catch { return {}; }
  });

  const [pickerDisplayNames, setPickerDisplayNames] = useState<Record<string, string>>(() => {
    const fromSession = session.pickerDisplayNames;
    if (fromSession && Object.keys(fromSession).length > 0) return fromSession;
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(SAVED_NAMES_KEY) ?? '{}') as Record<string, string>; }
    catch { return {}; }
  });
  const [palletSlots, setPalletSlots] = useState<PalletSlot[]>([]);
  const palletSlotsRef = useRef<PalletSlot[]>([]);
  palletSlotsRef.current = palletSlots;
  const pendingDeleteIds = useRef<Set<number>>(new Set());

  // Derived: count per state_key
  const pickerPallets = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of palletSlots) map[s.state_key] = (map[s.state_key] ?? 0) + 1;
    return map;
  }, [palletSlots]);

  // Derived: count per (state_key, tipo) — feeds the 3 independent counters
  const palletsByTipoAndStateKey = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const s of palletSlots) {
      const t = s.tipo || 'P';
      if (!result[s.state_key]) result[s.state_key] = {};
      result[s.state_key][t] = (result[s.state_key][t] ?? 0) + 1;
    }
    return result;
  }, [palletSlots]);

  // Derived: pallet_num for each slot = its rank (1-based) within (store_cod, tipo) independently.
  // P slots count P-1, P-2...; C slots count C-1, C-2...; B slots count B-1, B-2...
  const palletNumsBySlotId = useMemo(() => {
    const result: Record<number, number> = {};
    const byStoreTipo: Record<string, PalletSlot[]> = {};
    for (const s of palletSlots) {
      const key = `${s.store_cod}::${s.tipo || 'P'}`;
      if (!byStoreTipo[key]) byStoreTipo[key] = [];
      byStoreTipo[key].push(s);
    }
    for (const slots of Object.values(byStoreTipo)) {
      slots.forEach((s, idx) => { result[s.id] = idx + 1; });
    }
    return result;
  }, [palletSlots]);

  // Derived: sorted list of pallet numbers per state_key
  const assignedNumsByStateKey = useMemo(() => {
    const result: Record<string, number[]> = {};
    for (const s of palletSlots) {
      const num = palletNumsBySlotId[s.id];
      if (num !== undefined) {
        if (!result[s.state_key]) result[s.state_key] = [];
        result[s.state_key].push(num);
      }
    }
    for (const key of Object.keys(result)) result[key].sort((a, b) => a - b);
    return result;
  }, [palletSlots, palletNumsBySlotId]);

  // Slots per state_key sorted by pallet number (same order as assignedNumsByStateKey)
  const slotsByStateKey = useMemo(() => {
    const result: Record<string, PalletSlot[]> = {};
    for (const s of palletSlots) {
      if (!result[s.state_key]) result[s.state_key] = [];
      result[s.state_key].push(s);
    }
    for (const key of Object.keys(result)) {
      result[key].sort((a, b) => (palletNumsBySlotId[a.id] ?? 0) - (palletNumsBySlotId[b.id] ?? 0));
    }
    return result;
  }, [palletSlots, palletNumsBySlotId]);

  const [errorCods, setErrorCods]         = useState<string[]>([]);

  const [labelConfig, setLabelConfig] = useState<LabelConfig>(() => {
    if (typeof window === 'undefined') return DEFAULT_LABEL_CONFIG;
    try { return { ...DEFAULT_LABEL_CONFIG, ...JSON.parse(localStorage.getItem(LABEL_CONFIG_KEY) ?? '{}') }; }
    catch { return DEFAULT_LABEL_CONFIG; }
  });
  const [canonicalNames, setCanonicalNames] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(CANONICAL_NAMES_KEY) ?? '{}') as Record<string, string>; }
    catch { return {}; }
  });

  // ── Shared session state: picker names + types visible across all supervisor desktops ──
  const [sessionStateRows, setSessionStateRows] = useState<SessionStateRow[]>([]);
  const dirtyStateKeys  = useRef<Set<string>>(new Set());
  const upsertTimers    = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadSessionState = useCallback(async () => {
    try {
      const res  = await fetch(`/api/picking-session-state?date=${todayISO()}`);
      if (!res.ok) return;
      const json = await res.json() as { data?: SessionStateRow[] };
      setSessionStateRows(json.data ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadSessionState(); }, [loadSessionState]);
  useRealtimeRefresh('picking_session_state', loadSessionState);

  // Merge server state into local — skip keys actively being edited by this client
  // Only names are synced cross-client; tipos are managed locally per client (date-scoped localStorage)
  useEffect(() => {
    if (!sessionStateRows.length) return;
    setPickerDisplayNames(prev => {
      const next = { ...prev };
      for (const r of sessionStateRows)
        if (!dirtyStateKeys.current.has(r.state_key) && r.picker_label) next[r.state_key] = r.picker_label;
      return next;
    });
  }, [sessionStateRows]);

  // Debounced upsert — waits 500ms of inactivity before writing to server
  const upsertSessionState = useCallback((stateKey: string, pickerLabel: string, tipo: string) => {
    dirtyStateKeys.current.add(stateKey);
    clearTimeout(upsertTimers.current[stateKey]);
    upsertTimers.current[stateKey] = setTimeout(() => {
      void fetch('/api/picking-session-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state_key: stateKey, date: todayISO(), picker_label: pickerLabel, tipo }),
      }).then(() => { dirtyStateKeys.current.delete(stateKey); });
    }, 500);
  }, []);

  const [printOnlyStore, setPrintOnlyStore]   = useState<string | null>(null);
  const [doPrint, setDoPrint]                 = useState(false);
  const [selectionPrint, setSelectionPrint]   = useState<{ stateKey: string; palletNums: Set<number> } | null>(null);

  // Cross-desktop print visibility — tracks which stateKeys were printed today
  const [printedKeys, setPrintedKeys] = useState<Set<string>>(new Set());

  const loadPrintStatus = useCallback(async () => {
    try {
      const res  = await fetch(`/api/picking-prints?date=${todayISO()}`);
      if (!res.ok) return;
      const json = await res.json() as { data?: { state_key: string }[] };
      setPrintedKeys(new Set((json.data ?? []).map(r => r.state_key)));
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadPrintStatus(); }, [loadPrintStatus]);
  useRealtimeRefresh('picking_prints', loadPrintStatus);

  // ── Pallet slots: DB-backed, real-time ──────────────────────────────────────
  const loadPalletSlots = useCallback(async () => {
    try {
      const res  = await fetch(`/api/picking-pallets?date=${todayISO()}`);
      if (!res.ok) return;
      const json = await res.json() as { data?: PalletSlot[] };
      setPalletSlots(json.data ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadPalletSlots(); }, [loadPalletSlots]);
  useRealtimeRefresh('picking_pallets', loadPalletSlots);

  const addPalletSlot = useCallback(async (stateKey: string, storeCod: string, pickerLabel: string, tipo: string, contenido = 'hogar', refs = '') => {
    try {
      const res = await fetch('/api/picking-pallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: todayISO(), store_cod: storeCod, state_key: stateKey, picker_label: pickerLabel, tipo, contenido, refs }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        console.error('[picking] addPalletSlot error', res.status, err.error ?? '');
        return;
      }
      const json = await res.json() as { data?: PalletSlot };
      if (json.data) setPalletSlots(prev => [...prev, json.data!]);
    } catch (e) {
      console.error('[picking] addPalletSlot network error', e);
    }
  }, []);

  const removePalletSlot = useCallback(async (stateKey: string, tipo: string) => {
    // Read from ref (avoids stale closure) and skip pending deletes; filters by tipo for 3-counter accuracy
    const slot = palletSlotsRef.current
      .filter(s => s.state_key === stateKey && (s.tipo || 'P') === tipo && !pendingDeleteIds.current.has(s.id))
      .at(-1);
    if (!slot) return;
    pendingDeleteIds.current.add(slot.id);
    setPalletSlots(prev => prev.filter(s => s.id !== slot.id));
    try {
      const res = await fetch('/api/picking-pallets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: slot.id }),
      });
      if (!res.ok) setPalletSlots(prev => [...prev, slot].sort((a, b) => a.id - b.id));
    } catch {
      setPalletSlots(prev => [...prev, slot].sort((a, b) => a.id - b.id));
    } finally {
      pendingDeleteIds.current.delete(slot.id);
    }
  }, []);

  // Persistir filtro de sección en localStorage
  useEffect(() => {
    localStorage.setItem(SECTION_FILTER_KEY, sectionFilter);
  }, [sectionFilter]);

  // Persistir labelConfig en localStorage
  useEffect(() => {
    localStorage.setItem(LABEL_CONFIG_KEY, JSON.stringify(labelConfig));
  }, [labelConfig]);

  // ── Canonical names: shared across all supervisor desktops ────────────────────
  const loadCanonicalNames = useCallback(async () => {
    try {
      const res  = await fetch('/api/picker-canonical-names');
      if (!res.ok) return;
      const json = await res.json() as { data?: { key: string; display_name: string }[] };
      if (!json.data?.length) return;
      setCanonicalNames(prev => {
        const next = { ...prev };
        for (const r of json.data!) if (r.display_name) next[r.key] = r.display_name;
        return next;
      });
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadCanonicalNames(); }, [loadCanonicalNames]);
  useRealtimeRefresh('picker_canonical_names', loadCanonicalNames);

  const handleCanonicalNamesChange = useCallback((names: Record<string, string>, changedKey?: string, changedVal?: string) => {
    setCanonicalNames(names);
    localStorage.setItem(CANONICAL_NAMES_KEY, JSON.stringify(names));
    if (changedKey !== undefined) {
      void fetch('/api/picker-canonical-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: changedKey, display_name: changedVal ?? '' }),
      });
    }
  }, []);

  const handleColsPerRowChange = useCallback((n: number) => {
    setColsPerRow(n);
    localStorage.setItem(COLS_PER_ROW_KEY, String(n));
  }, []);

  // Case-insensitive lookup: Odoo may return "pickers 3" while canonical key is "Pickers 3"
  const getCanonicalName = useCallback((key: string): string => {
    if (canonicalNames[key]) return canonicalNames[key];
    const lower = key.toLowerCase();
    const match = CANONICAL_PICKER_KEYS.find(k => k.toLowerCase() === lower);
    return match ? (canonicalNames[match] ?? '') : '';
  }, [canonicalNames]);

  // Persistir nombres en localStorage (cross-session)
  useEffect(() => {
    localStorage.setItem(SAVED_NAMES_KEY, JSON.stringify(pickerDisplayNames));
  }, [pickerDisplayNames]);

  // Persistir sesión en sessionStorage cuando cambia el estado relevante
  useEffect(() => {
    saveSession({ date: todayISO(), selectedCods, opsMap, pickerDisplayNames });
  }, [selectedCods, opsMap, pickerDisplayNames]);

  // Disparar impresión después del re-render (para que el DOM refleje el filtro)
  useEffect(() => {
    if (!doPrint) return;
    setDoPrint(false);
    const handleAfterPrint = () => {
      setPrintOnlyStore(null);
      setSelectionPrint(null);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    window.print();
  }, [doPrint]);

  // Cargar tiendas del calendario (bust caché para evitar datos viejos del merge)
  const applyCalendar = useCallback((cal: Record<string, { rm: string[]; costa: string[]; fal: string[] }>) => {
    const DAY_CODES = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
    const today = DAY_CODES[new Date().getDay()];
    const day = cal[today];
    if (!day) return;
    setTodayStores([
      ...day.fal.map(cod   => ({ cod, name: getStoreName(cod), sources: ['regiones'] as ('rm' | 'regiones')[] })),
      ...day.costa.map(cod => ({ cod, name: getStoreName(cod), sources: ['rm']       as ('rm' | 'regiones')[] })),
      ...day.rm.map(cod    => ({ cod, name: getStoreName(cod), sources: ['rm']       as ('rm' | 'regiones')[] })),
    ]);
  }, []);

  useEffect(() => {
    setStoresLoading(true);
    // refreshCalendario busts both in-memory and localStorage cache → always gets live Sheets data
    refreshCalendario()
      .then(cal => { applyCalendar(cal); setStoresLoading(false); })
      .catch(() => setStoresLoading(false));
    // Re-apply when admin updates calendar from another tab
    return subscribeToCalendarChanges(applyCalendar);
  }, [applyCalendar]);

  // Si hay tiendas seleccionadas al restaurar sesión, mostrar planilla y re-cargar ops faltantes
  useEffect(() => {
    if (selectedCods.length > 0) {
      setPanelView('planilla');
      // Re-fetch ops for stores that are selected but have no opsMap data (SESSION_KEY bump)
      selectedCods.forEach(cod => { if (!opsMap[cod]) void fetchOpsForStore(cod); });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allGroups = useMemo((): PickerGroup[] => {
    const result: PickerGroup[] = [];
    for (const cod of selectedCods) {
      const ops = opsMap[cod] ?? [];
      // Group by normalized (lowercase/trim) name → same picker regardless of casing entered on each desktop
      const map: Record<string, { displayKey: string; ops: PickingOperation[] }> = {};
      for (const op of ops) {
        const raw        = op.responsible || 'Sin asignar';
        const normalized = raw.toLowerCase().trim();
        if (!map[normalized]) map[normalized] = { displayKey: raw, ops: [] };
        map[normalized].ops.push(op);
      }
      for (const [normKey, { displayKey, ops: gOps }] of Object.entries(map).sort(([a], [b]) => a.localeCompare(b))) {
        result.push({ key: displayKey, storeCod: cod, stateKey: `${cod}__${normKey}`, operations: gOps });
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
          responsible: string; responsibleId: number | null; lineCount: number;
        }>;
        error?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Error Odoo');
      const parsed: PickingOperation[] = (data.pickings ?? [])
        .filter(p => isAbastecimientoOp(p.origin) && !p.origin.toUpperCase().startsWith('AUDITORIA'))
        .map(p => {
          const { categories, storeCode, originDate } = parseOrigin(p.origin);
          return { ...p, categories, storeCodeFromOrigin: storeCode, originDate };
        });
      setOpsMap(prev => ({ ...prev, [cod]: parsed }));
      setErrorCods(prev => prev.filter(c => c !== cod));
      setLastRefresh(new Date());
    } catch (e) {
      console.error('[picking]', e);
      setErrorCods(prev => prev.includes(cod) ? prev : [...prev, cod]);
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

  const filteredGroups = useMemo(() => {
    if (sectionFilter === 'all') return allGroups;
    return allGroups.filter(g => {
      const cats = new Set(g.operations.flatMap(o => o.categories));
      if (sectionFilter === 'aseo-comida') return cats.has('Aseo') || cats.has('Comida');
      return cats.has('Hogar');
    });
  }, [allGroups, sectionFilter]);

  // Grupos de TODAS las secciones por tienda — para calcular offsets globales
  const allGroupedByStore = useMemo(() => {
    const map: Record<string, PickerGroup[]> = {};
    for (const g of allGroups) { if (!map[g.storeCod]) map[g.storeCod] = []; map[g.storeCod].push(g); }
    return map;
  }, [allGroups]);

  const groupedByStore = useMemo(() => {
    const map: Record<string, PickerGroup[]> = {};
    for (const g of filteredGroups) { if (!map[g.storeCod]) map[g.storeCod] = []; map[g.storeCod].push(g); }
    return map;
  }, [filteredGroups]);

  const recordPrints = useCallback((groups: PickerGroup[]) => {
    const date = todayISO();
    for (const group of groups) {
      const pallets = pickerPallets[group.stateKey] ?? 0;
      if (pallets === 0) continue;
      void fetch('/api/picking-prints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stateKey:    group.stateKey,
          pickerLabel: pickerDisplayNames[group.stateKey] || getCanonicalName(group.key) || group.key,
          pallets,
          tipo:        pickerTypes[group.stateKey] ?? 'P',
          date,
        }),
      });
    }
  }, [pickerPallets, pickerDisplayNames, pickerTypes, getCanonicalName]);

  const printStoreLabels = useCallback((cod: string) => {
    setSelectionPrint(null);
    setPrintOnlyStore(cod);
    setDoPrint(true);
    recordPrints(groupedByStore[cod] ?? []);
  }, [groupedByStore, recordPrints]);

  const printSelectedLabels = useCallback((stateKey: string, palletNums: Set<number>) => {
    setSelectionPrint({ stateKey, palletNums });
    setPrintOnlyStore(null);
    setDoPrint(true);
  }, []);

  const printAll = useCallback(() => {
    setPrintOnlyStore(null);
    setDoPrint(true);
    for (const cod of selectedCods) recordPrints(groupedByStore[cod] ?? []);
  }, [selectedCods, groupedByStore, recordPrints]);

  const todayLabel     = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  // Datos de impresión — una etiqueta por slot, sección activa del supervisor
  const printableLabels = useMemo(() => {
    type LabelData = {
      value: string; palletNum: number; total: number;
      storeCod: string; pickerLabel: string; responsibleKey: string;
      allCategories: string[]; totalPickers: number; stateKey: string; tipo: string; slotId: number;
    };
    const labels: LabelData[] = [];
    for (const cod of selectedCods) {
      const storeGroups    = groupedByStore[cod] ?? [];       // respects section filter
      const allStoreGroups = allGroupedByStore[cod] ?? [];    // for totalPickers count
      const storeSlots     = palletSlots.filter(s => s.store_cod === cod);
      if (storeSlots.length === 0 || storeGroups.length === 0) continue;
      // Pre-compute total per tipo for this store (P count, C count, B count independently)
      const totalByTipo: Record<string, number> = {};
      for (const s of storeSlots) totalByTipo[s.tipo || 'P'] = (totalByTipo[s.tipo || 'P'] ?? 0) + 1;

      const firstSlotTime: Record<string, number> = {};
      for (const s of storeSlots) {
        const t = new Date(s.created_at).getTime();
        if (firstSlotTime[s.state_key] === undefined || t < firstSlotTime[s.state_key])
          firstSlotTime[s.state_key] = t;
      }
      const sortedGroups = [...storeGroups].sort((a, b) =>
        (firstSlotTime[a.stateKey] ?? Infinity) - (firstSlotTime[b.stateKey] ?? Infinity)
      );

      for (const group of sortedGroups) {
        const groupSlots = storeSlots.filter(s => s.state_key === group.stateKey);
        if (!groupSlots.length) continue;
        const allCategories = [...new Set(group.operations.flatMap(o => o.categories))];
        const refs  = group.operations.map(o => o.name).join('+');
        const cats  = allCategories.join(',');
        // Prefer name typed by supervisor (local state), fall back to slot label stored in DB
        const label = pickerDisplayNames[group.stateKey] || groupSlots[0]?.picker_label || getCanonicalName(group.key) || group.key;
        for (const slot of groupSlots) {
          const pNum  = palletNumsBySlotId[slot.id];
          const tipo  = (slot.tipo as PickerType) ?? pickerTypes[group.stateKey] ?? 'P';
          const total = totalByTipo[tipo] ?? 1;
          labels.push({
            value: `${group.storeCod};${sanitizeForBarcode(label)};${refs};${tipo}${pNum};${cats}`,
            palletNum: pNum,
            total,
            storeCod: group.storeCod,
            pickerLabel: label,
            responsibleKey: group.key,
            allCategories,
            totalPickers: allStoreGroups.length,
            stateKey: group.stateKey,
            tipo,
            slotId: slot.id,
          });
        }
      }
    }
    return labels;
  }, [selectedCods, groupedByStore, allGroupedByStore, palletSlots, palletNumsBySlotId, pickerDisplayNames, pickerTypes, getCanonicalName]); // pickerTypes kept for fallback

  const hasBarcodes = printableLabels.length > 0;

  return (
    <>
    <style dangerouslySetInnerHTML={{ __html:
      '@media print{' +
      '@page{size:landscape;margin:0}' +
      'html,body{width:100%;height:100%;margin:0;padding:0}' +
      'body>*{display:none!important}' +
      '.picking-print-root{display:block!important;width:100%;height:100%}' +
      '.picking-label{display:flex!important;flex-direction:column!important;' +
      'width:100vw!important;height:100vh!important;max-width:100vw!important;' +
      'border-radius:0!important;margin:0!important;border:none!important;' +
      'padding:8mm!important;box-sizing:border-box!important;' +
      'break-after:page;page-break-after:always;overflow:hidden}' +
      '.picking-label>div{flex:1!important;display:flex!important;flex-direction:column!important;' +
      'height:100%!important;min-height:0!important;padding:0!important}' +
      '.picking-label:last-child{break-after:avoid;page-break-after:avoid}}'
    }} />

    {/* Vista print-only: solo etiquetas, sin chrome */}
    <div className="picking-print-root" style={{ display: 'none' }}>
      {(selectionPrint
        ? printableLabels.filter(l => l.stateKey === selectionPrint.stateKey && selectionPrint.palletNums.has(l.palletNum))
        : printOnlyStore
          ? printableLabels.filter(l => l.storeCod === printOnlyStore)
          : printableLabels
      ).map((label, idx) => (
        <BarcodeCard key={idx} {...label} labelConfig={labelConfig} />
      ))}
    </div>

    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#F5F6FA]">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0 print:hidden"
        style={{ background: 'linear-gradient(135deg, #78350F 0%, #D97706 100%)', boxShadow: '0 2px 16px rgba(217,119,6,0.35)' }}>
        <button className="lg:hidden border-none bg-white/15 text-white text-[14px] cursor-pointer font-barlow px-3 py-2 rounded-full"
          onClick={() => panelView === 'planilla' ? setPanelView('stores') : router.push('/')}>
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
          <button onClick={printAll}
            className="border-none bg-white/20 text-white font-bold text-[15px] cursor-pointer px-4 py-2 rounded-xl flex items-center gap-2 shrink-0">
            🖨 Imprimir {printableLabels.length} etiqueta{printableLabels.length !== 1 ? 's' : ''}
          </button>
        )}
        {lastRefresh && (
          <div className="text-[11px] text-white/50 hidden lg:block shrink-0">
            ↻ {lastRefresh.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
        <ProfilePill />
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
            errorCods={errorCods}
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

          {/* ── Tab bar ── */}
          <div className="flex items-end gap-1 px-4 pt-2 flex-shrink-0 print:hidden"
            style={{ background: '#fff', borderBottom: '2px solid #F0F2F5' }}>
            {([
              { key: 'monitoreo',     label: 'Monitoreo',     icon: '📋' },
              { key: 'historial',     label: 'Historial',     icon: '📜' },
              { key: 'estadisticas',  label: 'Estadísticas',  icon: '📊' },
              { key: 'configuracion', label: 'Configuración', icon: '⚙️' },
            ] as { key: typeof rightTab; label: string; icon: string }[]).map(tab => {
              const active = rightTab === tab.key;
              return (
                <button key={tab.key} onClick={() => setRightTab(tab.key)}
                  className="flex items-center gap-2 px-4 py-2.5 text-[14px] font-semibold cursor-pointer transition-all rounded-t-xl relative"
                  style={{
                    background: active ? 'rgba(217,119,6,0.07)' : 'transparent',
                    color: active ? '#92400E' : '#6B7280',
                    borderBottom: active ? '2px solid #D97706' : '2px solid transparent',
                    marginBottom: -2,
                  }}>
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* ── Tab content: Estadísticas ── */}
          {rightTab === 'estadisticas' && (
            <StatsTab odooConfig={odooConfig} hasOdoo={hasOdoo} />
          )}

          {/* ── Tab content: Historial ── */}
          {rightTab === 'historial' && <HistorialTab allGroups={allGroups} />}

          {/* ── Tab content: Configuración ── */}
          {rightTab === 'configuracion' && (
            <ConfigTab
              labelConfig={labelConfig}
              onLabelConfigChange={setLabelConfig}
              canonicalNames={canonicalNames}
              onCanonicalNamesChange={handleCanonicalNamesChange}
              colsPerRow={colsPerRow}
              onColsPerRowChange={handleColsPerRowChange}
            />
          )}

          {/* ── Tab content: Monitoreo ── */}
          {rightTab === 'monitoreo' && (selectedCods.length === 0 ? (
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
            <>
            <TurnoSummary
              allGroups={allGroups}
              pickerPallets={pickerPallets}
              printedKeys={printedKeys}
              selectedCods={selectedCods}
            />
            <div className="flex-1 overflow-y-auto px-4 pb-10">

              {/* Filtro de sección + columnas por fila */}
              <div className="mt-4 mb-3 print:hidden flex flex-wrap items-end gap-6">
                <div>
                  <div className="text-[11px] font-bold text-text-3 uppercase tracking-widest mb-2">Sección del supervisor</div>
                  <div className="flex gap-2">
                    {([
                      { key: 'all',         label: 'Todas' },
                      { key: 'aseo-comida', label: 'Aseo y Comida' },
                      { key: 'hogar',       label: 'Hogar' },
                    ] as { key: SectionFilter; label: string }[]).map(({ key, label }) => (
                      <button key={key} onClick={() => setSectionFilter(key)}
                        className="px-4 py-2 rounded-xl text-[13px] font-bold cursor-pointer transition-all active:scale-95"
                        style={{
                          background: sectionFilter === key ? 'linear-gradient(135deg, #78350F, #D97706)' : 'rgba(26,37,80,0.06)',
                          color: sectionFilter === key ? '#fff' : '#6B7280',
                          border: `1px solid ${sectionFilter === key ? 'rgba(217,119,6,0.5)' : 'rgba(26,37,80,0.12)'}`,
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              <div className="mb-4 flex items-center justify-between print:hidden">
                <div>
                  <div className="text-[15px] font-semibold text-text-2">
                    {filteredGroups.length === 0
                      ? 'Sin operaciones de Abastecimiento hoy'
                      : `${filteredGroups.length} picker${filteredGroups.length !== 1 ? 's' : ''} · ${selectedCods.length} tienda${selectedCods.length !== 1 ? 's' : ''}`}
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
                    <div className="flex items-center gap-3 mb-3 print:mb-2 flex-wrap">
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
                      {/* Per-store print button */}
                      {(() => {
                        const storeLabels = printableLabels.filter(l => l.storeCod === cod);
                        if (!storeLabels.length) return null;
                        return (
                          <button onClick={() => printStoreLabels(cod)}
                            className="ml-auto print:hidden text-[13px] font-bold px-3 py-1.5 rounded-xl cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
                            style={{ background: 'rgba(217,119,6,0.1)', color: '#D97706', border: '1px solid rgba(217,119,6,0.3)' }}>
                            🖨 {cod} · {storeLabels.length} etiqueta{storeLabels.length !== 1 ? 's' : ''}
                          </button>
                        );
                      })()}
                    </div>

                    {/* Sin asignar warning */}
                    {(() => {
                      const sinAsignar = (allGroupedByStore[cod] ?? []).filter(g => g.key === 'Sin asignar');
                      const count = sinAsignar.reduce((s, g) => s + g.operations.length, 0);
                      if (!count) return null;
                      return (
                        <div className="mb-3 print:hidden flex items-center gap-3 bg-white border border-[rgba(220,38,38,0.2)] rounded-xl px-4 py-2.5">
                          <span className="text-[20px] shrink-0">⚠️</span>
                          <div className="flex-1 text-[13px]" style={{ color: '#B91C1C' }}>
                            <span className="font-bold">{count} operación{count !== 1 ? 'es' : ''} sin responsable en Odoo</span>
                            {' '}— no generarán etiqueta. Asigna picker en Odoo y recarga.
                          </div>
                          <button onClick={() => void fetchOpsForStore(cod)}
                            className="text-[13px] font-bold px-3 py-1.5 rounded-lg cursor-pointer shrink-0 transition-all"
                            style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.25)' }}>
                            ↻ Recargar
                          </button>
                        </div>
                      );
                    })()}

                    {(() => {
                        const allStore = allGroupedByStore[cod] ?? [];

                        const renderCard = (group: PickerGroup, stickerBelow = false) => {
                          const nums = assignedNumsByStateKey[group.stateKey] ?? [];
                          return (
                            <PickerGroupCard
                              key={group.stateKey}
                              group={group}
                              displayName={pickerDisplayNames[group.stateKey] || getCanonicalName(group.key)}
                              palletsByTipo={palletsByTipoAndStateKey[group.stateKey] ?? {}}
                              onNameChange={name => {
                                setPickerDisplayNames(prev => ({ ...prev, [group.stateKey]: name }));
                                upsertSessionState(group.stateKey, name, 'P');
                              }}
                              onTipoPalletsChange={(tipo, n) => {
                                const current = palletsByTipoAndStateKey[group.stateKey]?.[tipo] ?? 0;
                                const delta = n - current;
                                const label = pickerDisplayNames[group.stateKey] || getCanonicalName(group.key) || group.key;
                                const groupCats = [...new Set(group.operations.flatMap(o => o.categories))];
                                const contenido = categoriesToContenido(groupCats);
                                const groupRefs = group.operations.map(o => o.name).join('+');
                                if (delta > 0) {
                                  for (let i = 0; i < delta; i++) void addPalletSlot(group.stateKey, cod, label, tipo, contenido, groupRefs);
                                } else if (delta < 0) {
                                  for (let i = 0; i < -delta; i++) void removePalletSlot(group.stateKey, tipo);
                                }
                              }}
                              onRefreshOp={(op) => void refreshOp(op, cod)}
                              onPrint={() => printStoreLabels(cod)}
                              refreshingId={refreshingId}
                              totalPickers={allStore.length}
                              assignedNums={nums}
                              isPrinted={printedKeys.has(group.stateKey)}
                              colsPerRow={colsPerRow}
                              onPrintSelected={(palletNums) => printSelectedLabels(group.stateKey, palletNums)}
                              slots={slotsByStateKey[group.stateKey] ?? []}
                              stickerBelow={stickerBelow}
                            />
                          );
                        };

                        // Filtro activo (Hogar / Aseo y Comida): render plano, sin cambios
                        if (sectionFilter !== 'all') {
                          return <div className="space-y-4">{storeGroups.map(g => renderCard(g))}</div>;
                        }

                        // "Todas": grid de 2 columnas fijas, siempre visibles
                        const SECTION_META = {
                          'aseo-comida': { label: 'Aseo y Comida', color: '#D97706', bg: 'rgba(217,119,6,0.06)',  border: 'rgba(217,119,6,0.28)' },
                          hogar:         { label: 'Hogar',         color: '#1D4ED8', bg: 'rgba(29,78,216,0.06)',  border: 'rgba(29,78,216,0.22)' },
                          mixto:         { label: 'Mixto',         color: '#7C3AED', bg: 'rgba(124,58,237,0.06)', border: 'rgba(124,58,237,0.22)' },
                        } as const;

                        const getSection = (g: PickerGroup): keyof typeof SECTION_META => {
                          const cats = new Set(g.operations.flatMap(o => o.categories));
                          const hasHogar      = cats.has('Hogar');
                          const hasAseoComida = cats.has('Aseo') || cats.has('Comida');
                          if (hasHogar && hasAseoComida) return 'mixto';
                          if (hasAseoComida) return 'aseo-comida';
                          return 'hogar';
                        };

                        const countSlots = (gs: PickerGroup[]) =>
                          gs.reduce((sum, g) => sum + Object.values(palletsByTipoAndStateKey[g.stateKey] ?? {}).reduce((a, b) => a + b, 0), 0);

                        const aseoComidaGroups = storeGroups.filter(g => getSection(g) === 'aseo-comida');
                        const hogarGroups      = storeGroups.filter(g => getSection(g) === 'hogar');
                        const mixtoGroups      = storeGroups.filter(g => getSection(g) === 'mixto');
                        const mixtoTotal       = countSlots(mixtoGroups);

                        const renderSectionHeader = (key: keyof typeof SECTION_META, total: number) => {
                          const meta = SECTION_META[key];
                          return (
                            <div className="mb-4 print:hidden">
                              <div className="flex items-center gap-3 mb-2">
                                <span className="font-barlow-condensed text-[22px] font-bold uppercase tracking-wide flex-shrink-0" style={{ color: meta.color }}>
                                  {meta.label}
                                </span>
                                {total > 0 && (
                                  <span className="text-[13px] font-bold px-2.5 py-0.5 rounded-full flex-shrink-0"
                                    style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                                    {total} pallet{total !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              <div className="h-[3px] rounded-full w-full" style={{ background: meta.color, opacity: 0.55 }} />
                            </div>
                          );
                        };

                        const columns: Array<{ key: keyof typeof SECTION_META; groups: PickerGroup[] }> = [
                          { key: 'aseo-comida', groups: aseoComidaGroups },
                          { key: 'hogar',       groups: hogarGroups },
                        ];

                        return (
                          <div className="space-y-4">
                            {/* Grid de 2 columnas fijas — ambas siempre visibles */}
                            <div className="grid grid-cols-2 gap-4 items-start">
                              {columns.map((col) => {
                                const total = countSlots(col.groups);
                                const meta  = SECTION_META[col.key];
                                return (
                                  <div key={col.key}>
                                    {renderSectionHeader(col.key, total)}
                                    {col.groups.length > 0 ? (
                                      <div className="space-y-3">
                                        {col.groups.map(g => renderCard(g, true))}
                                      </div>
                                    ) : (
                                      <div className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center py-10 px-4"
                                        style={{ borderColor: meta.color + '28', background: meta.bg }}>
                                        <div className="text-[28px] mb-1" style={{ opacity: 0.18 }}>□</div>
                                        <div className="text-[12px] font-semibold text-center" style={{ color: meta.color, opacity: 0.5 }}>
                                          Sin operaciones aún
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Mixto (Hogar + Aseo en el mismo picker) — ancho completo abajo */}
                            {mixtoGroups.length > 0 && (
                              <div>
                                {renderSectionHeader('mixto', mixtoTotal)}
                                <div className="space-y-3">
                                  {mixtoGroups.map(g => renderCard(g))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                  </div>
                );
              })}
            </div>
            </>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}
