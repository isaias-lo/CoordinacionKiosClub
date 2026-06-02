'use client';

import { useState, useMemo, useCallback } from 'react';
import type { OdooConfig, PickerStatRow, StatsCache } from '../picking-types';
import { STATS_CACHE_KEY, STATS_DATE_FROM, STATS_DATE_TO } from '../picking-types';
import { fmtDuration, fmtSecs, cphColor, isAllowedPicker, STAT_COLS } from '../picking-utils';

type StatSortKey = keyof PickerStatRow;

export function StatsTab({ odooConfig, hasOdoo }: { odooConfig: OdooConfig; hasOdoo: boolean }) {
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
