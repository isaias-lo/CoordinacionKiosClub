'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { ProfilePill } from '@/components/ProfilePill';
import { getOdooConfig } from '@/features/auditoria/utils/odooApi';
import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';
import { fetchCalendarioCompleto } from '@/features/despacho/utils/useCalendario';
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
  pickerPallets: Record<string, number>;
  pickerDisplayNames: Record<string, string>;
  pickerPalletOrder: string[];
}

const SAVED_NAMES_KEY    = 'picking_saved_picker_names';
const SESSION_KEY        = 'picking_session_v1';
const SECTION_FILTER_KEY = 'picking_section_filter';
const STATS_CACHE_KEY    = 'picking_stats_cache_v1';
const PALLETS_KEY        = 'picking_pallets_v1';
const AUTO_REFRESH_MS    = 3 * 60 * 1000; // 3 min

const STATS_DATE_FROM = '2026-05-01';
const STATS_DATE_TO   = '2026-05-31';

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

function BarcodeCard({ value, palletNum, total, storeCod, pickerLabel, responsibleKey, allCategories, totalPickers }: {
  value: string; palletNum: number; total: number;
  storeCod: string; pickerLabel: string; responsibleKey: string; allCategories: string[];
  totalPickers: number;
}) {
  const storeName = getStoreName(storeCod);
  return (
    <div
      className="picking-label bg-white border-2 border-gray-200 rounded-xl overflow-hidden print:break-after-page print:rounded-none print:border-0"
      style={{ maxWidth: 720, margin: '0 auto 20px' }}
    >
      <div className="flex flex-col" style={{ padding: '20px 22px 14px', minHeight: 480 }}>

        {/* Top row: picker (izquierda) + número de pallet (derecha) */}
        <div className="flex items-start justify-between" style={{ marginBottom: 8 }}>
          <div className="min-w-0 flex-1 pr-4">
            {/* Responsable Odoo */}
            <div style={{ fontSize: 12, color: '#D97706', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 2 }}>
              {responsibleKey}
            </div>
            {/* Nombre del picker — letra grande */}
            <div style={{ fontSize: 34, fontWeight: 800, color: '#111', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pickerLabel}
            </div>
            <div style={{ fontSize: 15, color: '#888', marginTop: 4, fontWeight: 500 }}>
              {totalPickers} picker{totalPickers !== 1 ? 's' : ''} en tienda
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-barlow-condensed font-black text-amber-600 leading-none" style={{ fontSize: 80 }}>
              P-{palletNum}
            </div>
            <div style={{ fontSize: 13, color: '#aaa', textAlign: 'right', fontWeight: 600 }}>de {total}</div>
          </div>
        </div>

        {/* Categorías — prominentes */}
        {allCategories.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            {allCategories.map(c => (
              <span key={c} style={{
                fontSize: 22, fontWeight: 800, color: '#1A2550',
                background: 'rgba(26,37,80,0.09)', borderRadius: 8,
                padding: '4px 14px', letterSpacing: '0.5px',
              }}>{c}</span>
            ))}
          </div>
        )}

        {/* Centro: código de tienda + nombre */}
        <div className="flex-1 flex flex-col items-center justify-center text-center" style={{ padding: '12px 0' }}>
          <div className="font-barlow-condensed font-black text-gray-900 tracking-widest uppercase leading-none"
            style={{ fontSize: 'clamp(128px, 28vw, 200px)', letterSpacing: '6px' }}>
            {storeCod}
          </div>
          <div className="font-barlow-condensed font-semibold text-gray-600 uppercase tracking-wide" style={{ fontSize: 52, marginTop: 10 }}>
            {storeName}
          </div>
        </div>

        {/* Código de barras en la parte inferior */}
        <div style={{ marginTop: 8 }}>
          <div style={{ width: '88%', margin: '0 auto' }}>
            <Barcode1D value={value} height={113} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
            <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#bbb', wordBreak: 'break-all', lineHeight: 1.2, flex: 1 }}>
              {value}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#888', fontFamily: 'monospace', whiteSpace: 'nowrap', marginLeft: 8 }}>
              {new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Picker Group Card (split: form izquierda | barcodes derecha) ─────────────

function PickerGroupCard({ group, displayName, pallets, onNameChange, onPalletsChange, onRefreshOp, onPrint, refreshingId, totalPickers, palletOffset, totalStorePallets, isPrinted }: {
  group: PickerGroup; displayName: string; pallets: number;
  onNameChange: (v: string) => void; onPalletsChange: (n: number) => void;
  onRefreshOp: (op: PickingOperation) => void; onPrint: () => void; refreshingId: number | null;
  totalPickers: number;
  palletOffset: number;
  totalStorePallets: number;
  isPrinted: boolean;
}) {
  const allDone       = group.operations.every(o => o.state === 'done');
  const allCategories = [...new Set(group.operations.flatMap(o => o.categories))];
  const refs          = group.operations.map(o => o.name).join('+');
  const cats          = allCategories.join(',');
  // El nombre se incluye en el barcode. Si no se ingresó, usar el nombre Odoo (group.key)
  const pickerLabel   = displayName || group.key;
  const barcodePickerName = sanitizeForBarcode(pickerLabel);

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
          </div>
        </div>

        {/* RIGHT: estado por op cuando hay pendientes / barcodes cuando todo done */}
        <div className="lg:w-[55%] p-4 bg-[#FAFAFA]">
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
          ) : pallets === 0 ? (
            <div className="h-full min-h-[180px] flex flex-col items-center justify-center gap-3 text-text-3">
              <div className="text-[40px] opacity-30">▊▊▊▊</div>
              <div className="text-[14px] text-center">Ingresa la cantidad de pallets<br/>para generar los códigos</div>
            </div>
          ) : (
            <div>
              <div className="print:hidden flex items-center justify-between mb-3">
                <div className="text-[13px] font-semibold text-text-2">{pallets} código{pallets !== 1 ? 's' : ''}</div>
                <button onClick={onPrint}
                  className="flex items-center gap-1.5 text-[14px] font-bold cursor-pointer px-4 py-2 rounded-xl transition-all active:scale-95"
                  style={isPrinted
                    ? { background: 'rgba(22,163,74,0.12)', color: '#16A34A', border: '1px solid rgba(22,163,74,0.4)' }
                    : { background: 'linear-gradient(135deg, #78350F, #D97706)', color: '#fff' }}>
                  {isPrinted ? '↺ Re-imprimir' : '🖨 Imprimir'}
                </button>
              </div>
              {Array.from({ length: pallets }, (_, i) => (
                <BarcodeCard
                  key={i}
                  value={`${group.storeCod}|${barcodePickerName}|${refs}|P${palletOffset + i + 1}|${cats}`}
                  palletNum={palletOffset + i + 1}
                  total={totalStorePallets}
                  storeCod={group.storeCod}
                  pickerLabel={pickerLabel}
                  responsibleKey={group.key}
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

function loadPalletsFromLS(): { pallets: Record<string, number>; order: string[] } {
  if (typeof window === 'undefined') return { pallets: {}, order: [] };
  try {
    const raw = localStorage.getItem(PALLETS_KEY);
    if (!raw) return { pallets: {}, order: [] };
    const s = JSON.parse(raw) as { date: string; pallets: Record<string, number>; order: string[] };
    if (s.date !== todayISO()) return { pallets: {}, order: [] };
    return { pallets: s.pallets ?? {}, order: s.order ?? [] };
  } catch { return { pallets: {}, order: [] }; }
}

function savePalletsToLS(pallets: Record<string, number>, order: string[]): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(PALLETS_KEY, JSON.stringify({ date: todayISO(), pallets, order })); } catch { /* ignore */ }
}

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
  const { profile } = useAuth();

  const odooConfig: OdooConfig = getOdooConfig() ?? { url: '', db: '', username: '', apiKey: '' };
  const hasOdoo = !!odooConfig.url;

  const [panelView, setPanelView] = useState<'stores' | 'planilla'>('stores');
  const [rightTab, setRightTab]   = useState<'monitoreo' | 'estadisticas'>('monitoreo');

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

  const [pickerDisplayNames, setPickerDisplayNames] = useState<Record<string, string>>(() => {
    const fromSession = session.pickerDisplayNames;
    if (fromSession && Object.keys(fromSession).length > 0) return fromSession;
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(SAVED_NAMES_KEY) ?? '{}') as Record<string, string>; }
    catch { return {}; }
  });
  const [pickerPallets, setPickerPallets] = useState<Record<string, number>>(() => {
    const { pallets } = loadPalletsFromLS();
    if (Object.keys(pallets).length > 0) return pallets;
    return session.pickerPallets ?? {};
  });
  const [pickerPalletOrder, setPickerPalletOrder] = useState<string[]>(() => {
    const { order } = loadPalletsFromLS();
    if (order.length > 0) return order;
    return session.pickerPalletOrder ?? [];
  });

  const [errorCods, setErrorCods]         = useState<string[]>([]);
  const [printOnlyStore, setPrintOnlyStore] = useState<string | null>(null);
  const [doPrint, setDoPrint]             = useState(false);

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

  // Persistir filtro de sección en localStorage
  useEffect(() => {
    localStorage.setItem(SECTION_FILTER_KEY, sectionFilter);
  }, [sectionFilter]);

  // Persistir nombres en localStorage (cross-session)
  useEffect(() => {
    localStorage.setItem(SAVED_NAMES_KEY, JSON.stringify(pickerDisplayNames));
  }, [pickerDisplayNames]);

  // Persistir pallets en localStorage (cross-tab, survives refresh)
  useEffect(() => {
    savePalletsToLS(pickerPallets, pickerPalletOrder);
  }, [pickerPallets, pickerPalletOrder]);

  // Persistir sesión en sessionStorage cuando cambia el estado relevante
  useEffect(() => {
    saveSession({ date: todayISO(), selectedCods, opsMap, pickerPallets, pickerDisplayNames, pickerPalletOrder });
  }, [selectedCods, opsMap, pickerPallets, pickerDisplayNames, pickerPalletOrder]);

  // Disparar impresión después del re-render (para que el DOM refleje el filtro)
  useEffect(() => {
    if (!doPrint) return;
    setDoPrint(false);
    const handleAfterPrint = () => {
      setPrintOnlyStore(null);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    window.print();
  }, [doPrint]);

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
          pickerLabel: pickerDisplayNames[group.stateKey] || group.key,
          pallets,
          date,
        }),
      });
    }
  }, [pickerPallets, pickerDisplayNames]);

  const printStoreLabels = useCallback((cod: string) => {
    setPrintOnlyStore(cod);
    setDoPrint(true);
    recordPrints(allGroupedByStore[cod] ?? []);
  }, [allGroupedByStore, recordPrints]);

  const printAll = useCallback(() => {
    setPrintOnlyStore(null);
    setDoPrint(true);
    for (const cod of selectedCods) recordPrints(allGroupedByStore[cod] ?? []);
  }, [selectedCods, allGroupedByStore, recordPrints]);

  const hasBarcodes    = allGroups.some(g => (pickerPallets[g.stateKey] ?? 0) > 0);
  const todayLabel     = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const groupedByStore = useMemo(() => {
    const map: Record<string, PickerGroup[]> = {};
    for (const g of filteredGroups) { if (!map[g.storeCod]) map[g.storeCod] = []; map[g.storeCod].push(g); }
    return map;
  }, [filteredGroups]);

  // Datos de impresión — todas las etiquetas en orden de entrada de pallets
  const printableLabels = useMemo(() => {
    type LabelData = {
      value: string; palletNum: number; total: number;
      storeCod: string; pickerLabel: string; responsibleKey: string;
      allCategories: string[]; totalPickers: number;
    };
    const labels: LabelData[] = [];
    for (const cod of selectedCods) {
      const storeGroups = allGroupedByStore[cod] ?? [];
      const sorted = [...storeGroups].sort((a, b) => {
        const ai = pickerPalletOrder.indexOf(a.stateKey);
        const bi = pickerPalletOrder.indexOf(b.stateKey);
        if (ai === -1 && bi === -1) return storeGroups.indexOf(a) - storeGroups.indexOf(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      const totalStorePallets = sorted.reduce((s, g) => s + (pickerPallets[g.stateKey] ?? 0), 0);
      let offset = 0;
      for (const group of sorted) {
        const groupPallets = pickerPallets[group.stateKey] ?? 0;
        if (groupPallets > 0) {
          const allCategories = [...new Set(group.operations.flatMap(o => o.categories))];
          const refs  = group.operations.map(o => o.name).join('+');
          const cats  = allCategories.join(',');
          const label = pickerDisplayNames[group.stateKey] || group.key;
          for (let i = 0; i < groupPallets; i++) {
            labels.push({
              value: `${group.storeCod}|${sanitizeForBarcode(label)}|${refs}|P${offset + i + 1}|${cats}`,
              palletNum: offset + i + 1,
              total: totalStorePallets,
              storeCod: group.storeCod,
              pickerLabel: label,
              responsibleKey: group.key,
              allCategories,
              totalPickers: storeGroups.length,
            });
          }
        }
        offset += groupPallets;
      }
    }
    return labels;
  }, [selectedCods, allGroupedByStore, pickerPalletOrder, pickerPallets, pickerDisplayNames]);

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
      {(printOnlyStore
        ? printableLabels.filter(l => l.storeCod === printOnlyStore)
        : printableLabels
      ).map((label, idx) => (
        <BarcodeCard key={idx} {...label} />
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
              { key: 'monitoreo',   label: 'Monitoreo de operaciones', icon: '📋' },
              { key: 'estadisticas', label: 'Estadísticas',             icon: '📊' },
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
            <div className="flex-1 overflow-y-auto px-4 pb-10">

              {/* Filtro de sección */}
              <div className="mt-4 mb-3 print:hidden">
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

                    <div className="space-y-4">
                      {(() => {
                        // Calcular offsets usando TODOS los grupos (ambas secciones) en orden de entrada
                        const allStore = allGroupedByStore[cod] ?? [];
                        const sortedAll = [...allStore].sort((a, b) => {
                          const ai = pickerPalletOrder.indexOf(a.stateKey);
                          const bi = pickerPalletOrder.indexOf(b.stateKey);
                          if (ai === -1 && bi === -1) return allStore.indexOf(a) - allStore.indexOf(b);
                          if (ai === -1) return 1;
                          if (bi === -1) return -1;
                          return ai - bi;
                        });
                        const totalStorePallets = sortedAll.reduce((s, g) => s + (pickerPallets[g.stateKey] ?? 0), 0);
                        return storeGroups.map(group => {
                          const groupPallets = pickerPallets[group.stateKey] ?? 0;
                          // Offset = suma de pallets de todos los grupos antes de éste en el orden global
                          let offset = 0;
                          for (const g of sortedAll) {
                            if (g.stateKey === group.stateKey) break;
                            offset += pickerPallets[g.stateKey] ?? 0;
                          }
                          return (
                            <PickerGroupCard
                              key={group.stateKey}
                              group={group}
                              displayName={pickerDisplayNames[group.stateKey] ?? ''}
                              pallets={groupPallets}
                              onNameChange={name => setPickerDisplayNames(prev => ({ ...prev, [group.stateKey]: name }))}
                              onPalletsChange={n => {
                                setPickerPallets(prev => ({ ...prev, [group.stateKey]: n }));
                                if (n > 0) setPickerPalletOrder(prev =>
                                  prev.includes(group.stateKey) ? prev : [...prev, group.stateKey]
                                );
                              }}
                              onRefreshOp={(op) => void refreshOp(op, cod)}
                              onPrint={() => printStoreLabels(cod)}
                              refreshingId={refreshingId}
                              totalPickers={allStore.length}
                              palletOffset={offset}
                              totalStorePallets={totalStorePallets}
                              isPrinted={printedKeys.has(group.stateKey)}
                            />
                          );
                        });
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}
