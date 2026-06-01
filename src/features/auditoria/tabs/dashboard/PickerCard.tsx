'use client';

import { useState } from 'react';
import { MetricBar } from '../../components/charts/MetricBar';
import { MiniStat } from '../../components/charts/MiniStat';
import { Sparkline } from '../../components/charts/Sparkline';
import { formatTimer } from '../../constants';
import { getPickerOdooStats } from '../../utils/odooApi';
import type { PickerOdooStats } from '../../utils/odooApi';
import { BONO_LABEL, BONO_COLOR, BONO_BG } from '../../utils/metricas';
import type { MetricasPicker } from '../../utils/metricas';
import type { OdooConfig } from '../../types';
import type { WeekTrend } from '../../components/charts/LineChart';

export interface PickerStats {
  picker: string;
  total: number;
  bueno: number;
  malo: number;
  pct: number;
  eficiencia: number;
  tieneUnidadData: boolean;
  totalPallets: number;
  totalUnidadesError: number;
  totalUnidadesEsperadas: number;
  faltanteItems: number;
  sobranteItems: number;
  faltanteUnidades: number;
  sobranteUnidades: number;
  totalDurationSeconds: number;
  durationCount: number;
}

export function effColor(v: number) { return v >= 90 ? '#16A34A' : v >= 70 ? '#D97706' : '#D32F2F'; }

export function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase() || '?';
}

export function initialsColor(name: string): string {
  const palette = ['#1a2550', '#16A34A', '#D97706', '#2563EB', '#9333EA', '#D32F2F', '#0891B2', '#BE185D'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % palette.length;
  return palette[h];
}

export function PickerCard({ stats, rank, trend, odooConfig, compact = false, pickerNames, metrica }: {
  stats: PickerStats; rank: number; trend: WeekTrend[];
  odooConfig: OdooConfig; compact?: boolean; pickerNames: Record<string, string>;
  metrica?: MetricasPicker;
}) {
  const [odooStats, setOdooStats] = useState<PickerOdooStats | null>(null);
  const [loadingOdoo, setLoadingOdoo] = useState(false);
  const [odooError, setOdooError] = useState('');

  const ec = effColor(stats.eficiencia);
  const pc = effColor(stats.pct);
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
  const realName = pickerNames[stats.picker]?.trim() || '';
  const showDualBar = stats.eficiencia !== stats.pct;

  const fetchOdoo = async () => {
    if (!odooConfig.url) return;
    setLoadingOdoo(true); setOdooError('');
    try { const s = await getPickerOdooStats(odooConfig, stats.picker); setOdooStats(s); if (!s) setOdooError('No encontrado en Odoo'); }
    catch (e) { setOdooError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoadingOdoo(false); }
  };

  return (
    <div className="bg-white border border-border rounded-card mb-3 overflow-hidden"
      style={{ boxShadow: rank <= 3 ? '0 4px 20px rgba(26,37,80,0.12)' : '0 2px 8px rgba(26,37,80,0.06)', borderColor: rank === 1 ? `${ec}40` : undefined }}>
      <div className="h-1" style={{ background: `linear-gradient(90deg, ${ec}50, ${ec})` }} />
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 relative overflow-hidden"
            style={{ background: initialsColor(realName || stats.picker) }}>
            <span className="font-barlow-condensed font-bold text-[16px] text-white leading-none">
              {getInitials(realName || stats.picker)}
            </span>
            {medal && (
              <span className="absolute -bottom-0.5 -right-0.5 text-[14px] leading-none">{medal}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-barlow-condensed text-[18px] font-bold text-navy leading-tight">{realName || stats.picker}</div>
              {metrica && (
                <span style={{ padding: '1px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: BONO_BG[metrica.estado_bono], color: BONO_COLOR[metrica.estado_bono] }}>
                  {BONO_LABEL[metrica.estado_bono]}
                </span>
              )}
            </div>
            {realName && <div className="text-[11px] text-text-3">{stats.picker}</div>}
            <div className="text-[12px] text-text-3 mt-0.5">{stats.bueno} buenos · {stats.malo} malos · {stats.total} total · {stats.totalPallets} pal.{stats.durationCount > 0 ? ` · ⏱ ${formatTimer(Math.round(stats.totalDurationSeconds / stats.durationCount))} prom.` : ''}</div>
            {metrica && metrica.auditados_mes > 0 && (
              <div className="text-[11px] text-text-3 mt-0.5">Mes: {metrica.auditados_mes} aud. · déficit: {metrica.deficit > 0 ? <span style={{ color: '#D32F2F', fontWeight: 700 }}>{metrica.deficit}</span> : <span style={{ color: '#16A34A' }}>✓</span>}</div>
            )}
          </div>
          {/* Big % */}
          <div className="text-right flex-shrink-0">
            <div className="font-barlow-condensed font-black leading-none" style={{ fontSize: compact ? 40 : 48, color: ec }}>{stats.eficiencia}%</div>
            <div className="text-[10px] text-text-3 uppercase tracking-wide">eficiencia</div>
            {trend.length >= 2 && <div className="mt-1 flex justify-end"><Sparkline points={trend.map(t => t.pct)} color={ec} /></div>}
          </div>
        </div>

        {/* Metric bars */}
        <div className="space-y-2.5 mb-4">
          <MetricBar label={stats.tieneUnidadData ? 'Eficiencia de unidades' : 'Aprobación auditorías'} value={stats.eficiencia} color={ec} />
          {showDualBar && <MetricBar label="Aprobación auditorías" value={stats.pct} color={pc} />}
        </div>

        {/* Stats grid */}
        {!compact && (
          <div className={`grid gap-2 py-3 border-t border-b border-border/50 mb-3 ${stats.durationCount > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <MiniStat label="Auditorías" value={stats.total} />
            <MiniStat label="Pallets" value={stats.totalPallets} />
            <MiniStat label="Unid. error" value={stats.totalUnidadesError} color={stats.totalUnidadesError > 0 ? '#D32F2F' : '#16A34A'} />
            {stats.durationCount > 0 && <MiniStat label="⏱ Prom." value={formatTimer(Math.round(stats.totalDurationSeconds / stats.durationCount))} color="#1a2550" />}
          </div>
        )}

        {/* Error breakdown */}
        {!compact && (stats.faltanteUnidades > 0 || stats.sobranteUnidades > 0) && (
          <div className="flex gap-3 mb-3 flex-wrap">
            {stats.faltanteUnidades > 0 && (
              <div className="flex items-center gap-1.5 bg-[rgba(211,47,47,0.06)] border border-red/20 rounded-btn px-2.5 py-1.5">
                <span className="text-[14px]">↓</span>
                <div><div className="text-[13px] font-bold text-red">{stats.faltanteUnidades} u. faltante</div><div className="text-[10px] text-text-3">{stats.faltanteItems} producto{stats.faltanteItems !== 1 ? 's' : ''}</div></div>
              </div>
            )}
            {stats.sobranteUnidades > 0 && (
              <div className="flex items-center gap-1.5 bg-[rgba(217,119,6,0.06)] border border-warn/20 rounded-btn px-2.5 py-1.5">
                <span className="text-[14px]">↑</span>
                <div><div className="text-[13px] font-bold text-warn">{stats.sobranteUnidades} u. sobrante</div><div className="text-[10px] text-text-3">{stats.sobranteItems} producto{stats.sobranteItems !== 1 ? 's' : ''}</div></div>
              </div>
            )}
          </div>
        )}

        {stats.tieneUnidadData && !compact && (
          <div className="text-[11px] text-text-3 italic mb-3">
            {stats.totalUnidadesError} unidades con error de {stats.totalUnidadesEsperadas} esperadas ({(100 - stats.eficiencia).toFixed(1)}% tasa de error)
          </div>
        )}

        {/* Odoo stats section */}
        {!compact && (
          <div className="border-t border-border/40 pt-3">
            {!odooStats && !loadingOdoo && (
              <button onClick={fetchOdoo} disabled={!odooConfig.url} className="text-[11px] font-bold text-info border border-info/30 bg-[rgba(37,99,235,0.04)] rounded-btn px-3 py-1.5 cursor-pointer disabled:opacity-40 flex items-center gap-1.5">
                🔗 Ver stats Odoo (90 días)
              </button>
            )}
            {loadingOdoo && <div className="flex items-center gap-2 text-[11px] text-text-3"><div className="w-3 h-3 border border-navy/30 border-t-navy rounded-full animate-spin" />Consultando Odoo…</div>}
            {odooError && <div className="text-[11px] text-text-3 italic">{odooError}</div>}
            {odooStats && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Completados (90d)', value: odooStats.totalDone, color: '#16A34A' },
                  { label: 'Esta semana', value: odooStats.doneThisWeek, color: '#2563EB' },
                  { label: 'En proceso', value: odooStats.totalAssigned, color: '#D97706' },
                  { label: 'Discrepancias', value: odooStats.discrepancias, color: odooStats.discrepancias > 0 ? '#D32F2F' : '#16A34A' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center bg-bg rounded-btn p-2">
                    <div className="font-barlow-condensed text-[20px] font-bold" style={{ color }}>{value}</div>
                    <div className="text-[10px] text-text-3 uppercase tracking-wide">{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
