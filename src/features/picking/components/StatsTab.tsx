'use client';

import { useState, useMemo, useCallback } from 'react';
import { RotateCcw, Printer } from 'lucide-react';
import type { OdooConfig, PickerStatRow, StatsCache } from '../picking-types';
import { STATS_CACHE_KEY, STATS_DATE_FROM, STATS_DATE_TO } from '../picking-types';
import { fmtDuration, fmtSecs, isAllowedPicker } from '../picking-utils';

type SortKey = keyof PickerStatRow;

interface Props {
  odooConfig:     OdooConfig;
  hasOdoo:        boolean;
  canonicalNames: Record<string, string>;
}

// Columnas de la tabla — en orden exacto pedido por el negocio
const COLS: {
  key:   SortKey;
  label: string;
  hint:  string;
  right: boolean;
  render: (row: PickerStatRow) => string | number;
  footer: (rows: PickerStatRow[]) => string | number;
}[] = [
  {
    key: 'ops', label: 'Ops', hint: 'Operaciones completadas', right: true,
    render: r => r.ops,
    footer: rows => rows.reduce((s, r) => s + r.ops, 0),
  },
  {
    key: 'avgMinutesPerOp', label: 'Prom / Op', hint: 'Tiempo promedio por operación completa', right: true,
    render: r => fmtDuration(r.avgMinutesPerOp),
    footer: rows => fmtDuration(Math.round(rows.reduce((s, r) => s + r.avgMinutesPerOp, 0) / (rows.length || 1))),
  },
  {
    key: 'lineCount', label: 'Cant. SKU', hint: 'Líneas / SKUs escaneados en el período', right: true,
    render: r => r.lineCount.toLocaleString('es-CL'),
    footer: rows => rows.reduce((s, r) => s + r.lineCount, 0).toLocaleString('es-CL'),
  },
  {
    key: 'avgSecondsPerLine', label: 'T. Prom / SKU', hint: 'Tiempo promedio entre pistolazos (por SKU escaneado)', right: true,
    render: r => fmtSecs(r.avgSecondsPerLine),
    footer: rows => fmtSecs(Math.round(rows.reduce((s, r) => s + r.avgSecondsPerLine, 0) / (rows.length || 1))),
  },
  {
    key: 'units', label: 'Unidades', hint: 'Unidades movidas (qty done)', right: true,
    render: r => r.units.toLocaleString('es-CL'),
    footer: rows => rows.reduce((s, r) => s + r.units, 0).toLocaleString('es-CL'),
  },
  {
    key: 'avgMinutesPerOp', label: 'T. Prom / Pedido', hint: 'Tiempo promedio por pedido completo', right: true,
    render: r => fmtSecs(Math.round(r.avgMinutesPerOp * 60)),
    footer: rows => fmtSecs(Math.round(rows.reduce((s, r) => s + r.avgMinutesPerOp * 60, 0) / (rows.length || 1))),
  },
];

export function StatsTab({ odooConfig, hasOdoo, canonicalNames }: Props) {
  const [cache, setCache] = useState<StatsCache | null>(() => {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem(STATS_CACHE_KEY) ?? 'null') as StatsCache | null; }
    catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const [dateFrom,     setDateFrom]     = useState(STATS_DATE_FROM);
  const [dateTo,       setDateTo]       = useState(STATS_DATE_TO);
  const [pendingFrom,  setPendingFrom]  = useState(STATS_DATE_FROM);
  const [pendingTo,    setPendingTo]    = useState(STATS_DATE_TO);
  const datesChanged = pendingFrom !== dateFrom || pendingTo !== dateTo;

  const loadStats = useCallback(async (fromOverride?: string, toOverride?: string) => {
    if (!hasOdoo) return;
    setLoading(true); setError(null);
    const from = fromOverride ?? dateFrom;
    const to   = toOverride   ?? dateTo;
    try {
      const res  = await fetch('/api/odoo', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'picking_stats_range', config: odooConfig, dateFrom: from, dateTo: to }),
        signal:  AbortSignal.timeout(90_000),
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
    if (!window.confirm(`¿Cambiar el período de estadísticas?\n\nNuevo rango: ${fmt(pendingFrom)} — ${fmt(pendingTo)}\n\nEsto borrará los datos en caché.`)) return;
    setDateFrom(pendingFrom); setDateTo(pendingTo);
    setCache(null); localStorage.removeItem(STATS_CACHE_KEY);
    void loadStats(pendingFrom, pendingTo);
  }

  const sorted = useMemo(() => {
    if (!cache) return [];
    return [...cache.rows.filter(r => isAllowedPicker(r.name))].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === 'string' ? (av as string).localeCompare(bv as string) : (av as number) - (bv as number);
      return sortAsc ? cmp : -cmp;
    });
  }, [cache, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(key === 'name'); }
  };

  const cachedAt = cache?.cachedAt
    ? new Date(cache.cachedAt).toLocaleString('es-CL', { timeZone: 'America/Santiago', hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  function exportStats() {
    if (!sorted.length) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
    const rows = sorted.map((r, i) => {
      const confName = canonicalNames[r.name] ?? '';
      return `<tr class="${i % 2 === 0 ? '' : 'alt'}">
<td class="name">${r.name}${confName ? `<span class="conf"> · ${confName}</span>` : ''}</td>
<td class="r">${r.ops}</td>
<td class="r">${fmtDuration(r.avgMinutesPerOp)}</td>
<td class="r">${r.lineCount.toLocaleString('es-CL')}</td>
<td class="r">${fmtSecs(r.avgSecondsPerLine)}</td>
<td class="r">${r.units.toLocaleString('es-CL')}</td>
<td class="r">${fmtSecs(Math.round(r.avgMinutesPerOp * 60))}</td>
</tr>`;
    }).join('');
    win.document.write(`<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8"><title>Estadísticas Pickers</title>
<style>
@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;font-size:13px;color:#111}
header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #1E293B}
h1{font-size:20px;font-weight:900;color:#1E293B}.sub{font-size:12px;color:#666;margin-top:3px}
.meta{font-size:11px;color:#999;text-align:right;line-height:1.6}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#1E293B;color:#fff;padding:8px 10px;font-weight:600;text-align:left;white-space:nowrap}
th.r,td.r{text-align:right}td{padding:7px 10px;border-bottom:1px solid #E2E8F0}
td.name{font-weight:600;color:#1E293B}.conf{font-weight:400;color:#94A3B8;font-size:11px}
td.r{font-family:monospace}tr.alt td{background:#F8FAFC}
tfoot td{background:#F1F5F9!important;font-weight:700;border-top:2px solid #E2E8F0;color:#1E293B}
footer{margin-top:10px;font-size:10px;color:#999;text-align:right}
.print-btn{margin-top:14px;padding:8px 22px;background:#1E293B;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer}
@media print{.print-btn{display:none}}
</style></head><body>
<header>
<div><h1>Estadísticas de Pickers — KiosClub</h1>
<div class="sub">Período: ${fmt(dateFrom)} — ${fmt(dateTo)}</div></div>
<div class="meta">Generado: ${new Date().toLocaleString('es-CL')}<br>${sorted.length} pickers · ${sorted.reduce((s, r) => s + r.ops, 0)} operaciones</div>
</header>
<table>
<thead><tr>
<th>Nombre</th><th class="r">Ops</th><th class="r">Prom/Op</th>
<th class="r">Cant.SKU</th><th class="r">T.Prom/SKU</th>
<th class="r">Unidades</th><th class="r">T.Prom/Pedido</th>
</tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr>
<td>TOTAL / PROMEDIO</td>
<td class="r">${sorted.reduce((s, r) => s + r.ops, 0)}</td>
<td class="r">${fmtDuration(Math.round(sorted.reduce((s, r) => s + r.avgMinutesPerOp, 0) / (sorted.length || 1)))}</td>
<td class="r">${sorted.reduce((s, r) => s + r.lineCount, 0).toLocaleString('es-CL')}</td>
<td class="r">${fmtSecs(Math.round(sorted.reduce((s, r) => s + r.avgSecondsPerLine, 0) / (sorted.length || 1)))}</td>
<td class="r">${sorted.reduce((s, r) => s + r.units, 0).toLocaleString('es-CL')}</td>
<td class="r">${fmtSecs(Math.round(sorted.reduce((s, r) => s + r.avgMinutesPerOp * 60, 0) / (sorted.length || 1)))}</td>
</tr></tfoot>
</table>
<footer>KiosClub · Exportado el ${new Date().toLocaleString('es-CL')}</footer>
<button class="print-btn" onclick="window.print()">Imprimir</button>
</body></html>`);
    win.document.close();
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b" style={{ borderColor: '#E2E8F0' }}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="text-[15px] font-semibold" style={{ color: '#1E293B' }}>
              Estadísticas de pickers
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <input type="date" value={pendingFrom} onChange={e => setPendingFrom(e.target.value)}
                className="border rounded px-2 py-1 text-[13px] outline-none cursor-pointer"
                style={{ borderColor: '#E2E8F0', color: '#334155', background: '#fff' }} />
              <span className="text-[13px]" style={{ color: '#94A3B8' }}>—</span>
              <input type="date" value={pendingTo} onChange={e => setPendingTo(e.target.value)}
                className="border rounded px-2 py-1 text-[13px] outline-none cursor-pointer"
                style={{ borderColor: '#E2E8F0', color: '#334155', background: '#fff' }} />
              {datesChanged && (
                <button onClick={applyDateChange}
                  className="px-3 py-1 rounded text-[13px] font-medium cursor-pointer"
                  style={{ background: '#1E40AF', color: '#fff', border: 'none' }}>
                  Aplicar
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {cachedAt && (
              <span className="text-[12px]" style={{ color: '#94A3B8' }}>
                Actualizado: <span className="font-medium" style={{ color: '#64748B' }}>{cachedAt}</span>
              </span>
            )}
            {sorted.length > 0 && (
              <button onClick={exportStats}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[13px] font-medium cursor-pointer"
                style={{ background: '#2563EB', color: '#fff', border: 'none' }}>
                <Printer size={13} /> Exportar
              </button>
            )}
            <button onClick={() => void loadStats()} disabled={loading || !hasOdoo}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[13px] font-medium cursor-pointer disabled:opacity-40"
              style={{ background: '#1E293B', color: '#fff', border: 'none' }}>
              <RotateCcw size={13} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Cargando…' : cache ? 'Actualizar' : 'Cargar datos'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-4">

        {/* Alertas */}
        {!hasOdoo && (
          <div className="mt-4 rounded px-4 py-3 text-[13px]"
            style={{ background: '#FFF1F2', border: '1px solid rgba(220,38,38,0.25)', color: '#DC2626' }}>
            <span className="font-semibold">Odoo no configurado.</span>{' '}
            Configura las credenciales para cargar estadísticas.
          </div>
        )}
        {error && (
          <div className="mt-4 rounded px-4 py-3 text-[13px]"
            style={{ background: '#FFF1F2', border: '1px solid rgba(220,38,38,0.25)', color: '#DC2626' }}>
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}

        {/* Empty state */}
        {!cache && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-[48px] mb-4 opacity-20">📊</div>
            <div className="text-[15px] font-semibold mb-1" style={{ color: '#334155' }}>Sin datos cargados</div>
            <div className="text-[13px]" style={{ color: '#94A3B8' }}>
              Presiona <strong>Cargar datos</strong> para consultar las estadísticas del período.
            </div>
          </div>
        )}

        {/* Tabla */}
        {cache && sorted.length > 0 && (
          <div className="mt-4 rounded overflow-hidden"
            style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ background: '#1E293B' }}>
                    {/* Nombre — sorteable */}
                    <th onClick={() => handleSort('name')} title="Responsable Odoo + nombre configurado"
                      className="px-4 py-3 font-semibold text-[12px] text-white cursor-pointer select-none whitespace-nowrap text-left">
                      <span className="inline-flex items-center gap-1">
                        Nombre
                        {sortKey === 'name' && <span style={{ color: '#FCD34D' }}>{sortAsc ? '▲' : '▼'}</span>}
                      </span>
                    </th>
                    {COLS.map((col, ci) => (
                      <th key={`${col.key}-${ci}`} onClick={() => handleSort(col.key)} title={col.hint}
                        className="px-4 py-3 font-semibold text-[12px] text-white cursor-pointer select-none whitespace-nowrap"
                        style={{ textAlign: 'right' }}>
                        <span className="inline-flex items-center gap-1 justify-end">
                          {col.label}
                          {/* Solo mostrar indicador en la primera columna que usa esa key */}
                          {sortKey === col.key && ci === COLS.findIndex(c => c.key === col.key) && (
                            <span style={{ color: '#FCD34D' }}>{sortAsc ? '▲' : '▼'}</span>
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, i) => {
                    const confName = canonicalNames[row.name] ?? '';
                    return (
                      <tr key={row.name} style={{ background: i % 2 === 0 ? '#fff' : '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                        {/* Nombre Odoo + nombre config */}
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="font-semibold text-[13px]" style={{ color: '#1E293B' }}>{row.name}</div>
                          {confName && (
                            <div className="text-[11px] mt-0.5 font-medium" style={{ color: '#64748B' }}>{confName}</div>
                          )}
                        </td>
                        {COLS.map((col, ci) => (
                          <td key={`${col.key}-${ci}`} className="px-4 py-2.5 font-mono text-right text-[12px]"
                            style={{ color: '#475569' }}>
                            {col.render(row)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#F8FAFC', borderTop: '2px solid #E2E8F0' }}>
                    <td className="px-4 py-3 font-semibold text-[12px]" style={{ color: '#475569' }}>
                      TOTAL / PROMEDIO · {sorted.length} pickers
                    </td>
                    {COLS.map((col, ci) => (
                      <td key={`${col.key}-${ci}`} className="px-4 py-3 font-bold font-mono text-right text-[13px]"
                        style={{ color: '#1E293B' }}>
                        {col.footer(sorted)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-4 py-2 text-[11px] border-t" style={{ borderColor: '#E2E8F0', color: '#94A3B8' }}>
              {sorted.length} pickers · {sorted.reduce((s, r) => s + r.ops, 0)} operaciones ·{' '}
              {sorted.reduce((s, r) => s + r.units, 0).toLocaleString('es-CL')} unidades ·{' '}
              {sorted.reduce((s, r) => s + r.lineCount, 0).toLocaleString('es-CL')} SKUs
            </div>
          </div>
        )}

        {cache && sorted.length === 0 && !loading && (
          <div className="text-center py-12 text-[13px]" style={{ color: '#94A3B8' }}>
            Sin operaciones registradas para el período.
          </div>
        )}
      </div>
    </div>
  );
}
