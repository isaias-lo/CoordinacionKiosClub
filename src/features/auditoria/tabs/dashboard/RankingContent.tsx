'use client';

import { useState, useEffect, useMemo } from 'react';
import { PickerCard } from './PickerCard';
import { LineChart } from '../../components/charts/LineChart';
import { computeRanking, computeWeeklyTrend, displayPicker } from './helpers';
import { fetchParametros, fetchProduccionMes, fetchProduccionHoy, computeMetricas, todayISO as metricasTodayISO } from '../../utils/metricas';
import type { MetricasPicker } from '../../utils/metricas';
import { LINE_COLORS } from '../../constants';
import { PICKERS_LIST } from '../../data/pickerNames';
import type { AuditEntry, OdooConfig } from '../../types';

export function RankingContent({ history, odooConfig, pickerNames }: { history: AuditEntry[]; odooConfig: OdooConfig; pickerNames: Record<string, string> }) {
  const [scope, setScope] = useState<'hoy' | 'total'>('total');
  const [rView, setRView] = useState<'barras' | 'semanal'>('barras');
  const [selectedPickers, setSelectedPickers] = useState<string[]>([]);
  const [metricasPickers, setMetricasPickers] = useState<MetricasPicker[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [p, prodMes, prodHoy] = await Promise.all([fetchParametros(), fetchProduccionMes(new Date()), fetchProduccionHoy()]);
      if (cancelled) return;
      const r = computeMetricas(history, prodMes, prodHoy, p, metricasTodayISO());
      setMetricasPickers(r.pickers);
    }
    load();
    return () => { cancelled = true; };
  }, [history]);

  const today = new Date().toLocaleDateString('es-CL');
  const entries = scope === 'hoy' ? history.filter(e => e.fecha === today) : history;
  const rankingData = useMemo(() => computeRanking(entries), [entries]);
  const weeklyTrends = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeWeeklyTrend>>();
    (selectedPickers.length ? selectedPickers : rankingData.slice(0, 6).map(r => r.picker)).forEach(p => m.set(p, computeWeeklyTrend(history, p)));
    return m;
  }, [history, rankingData, selectedPickers]);

  const totalAct = rankingData.length;
  const avgEff = totalAct ? Math.round(rankingData.reduce((s, r) => s + r.eficiencia, 0) / totalAct) : 0;
  const avgPct = totalAct ? Math.round(rankingData.reduce((s, r) => s + r.pct, 0) / totalAct) : 0;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 flex flex-wrap gap-2 flex-shrink-0">
        {(['hoy', 'total'] as const).map(s => (
          <button key={s} onClick={() => setScope(s)} className={`px-4 py-1.5 rounded-full font-barlow-condensed text-[13px] font-bold border cursor-pointer ${scope === s ? 'bg-navy text-white border-navy' : 'bg-white text-text-2 border-border'}`}>{s === 'hoy' ? 'Hoy' : 'Histórico'}</button>
        ))}
        <div className="flex-1" />
        {(['barras', 'semanal'] as const).map(v => (
          <button key={v} onClick={() => setRView(v)} className={`px-4 py-1.5 rounded-full font-barlow-condensed text-[13px] font-bold border cursor-pointer ${rView === v ? 'bg-[rgba(26,37,80,0.10)] text-navy border-navy/30' : 'bg-white text-text-2 border-border'}`}>{v === 'barras' ? '▮▮ Barras' : '📈 Semanal'}</button>
        ))}
      </div>

      {rankingData.length > 0 && (
        <div className="px-4 py-2.5 grid grid-cols-4 gap-2 flex-shrink-0">
          {[
            { v: totalAct, l: 'Activos', c: '#1a2550' },
            { v: `${avgEff}%`, l: 'Efic. prom.', c: avgEff >= 80 ? '#16A34A' : '#D97706' },
            { v: `${avgPct}%`, l: 'Aprob. prom.', c: avgPct >= 80 ? '#16A34A' : '#D97706' },
            { v: rankingData.reduce((s, r) => s + r.total, 0), l: 'Auditorías', c: '#1a2550' },
          ].map(({ v, l, c }) => (
            <div key={l} className="bg-white border border-border rounded-card p-2 text-center" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
              <div className="font-barlow-condensed text-[20px] font-bold" style={{ color: c }}>{v}</div>
              <div className="text-[10px] text-text-3 uppercase tracking-wide leading-tight mt-0.5">{l}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {rView === 'barras' ? (
          rankingData.length === 0
            ? <div className="text-center py-16 text-text-3"><div className="text-[40px] mb-3">📊</div><div className="font-barlow-condensed text-[16px]">Sin datos para {scope === 'hoy' ? 'hoy' : 'el histórico'}.</div></div>
            : <>
                {rankingData.map((s, i) => {
                  const realName = pickerNames[s.picker]?.trim() || s.picker;
                  const metrica = metricasPickers.find(m => m.picker_nombre === realName || m.picker_nombre === s.picker);
                  return (
                    <PickerCard key={s.picker} stats={s} rank={i + 1} trend={computeWeeklyTrend(history, s.picker)} odooConfig={odooConfig} pickerNames={pickerNames} metrica={metrica} />
                  );
                })}
                {(() => {
                  const activos = new Set(rankingData.map(r => r.picker));
                  const sin = PICKERS_LIST.filter(p => !activos.has(p));
                  if (!sin.length) return null;
                  return (
                    <div className="mt-2">
                      <div className="text-[11px] text-text-3 uppercase tracking-wide mb-2">Sin auditorías en este período</div>
                      <div className="flex flex-wrap gap-1.5">{sin.map(p => <span key={p} className="text-[11px] text-text-3 bg-bg-2 border border-border px-2.5 py-1 rounded-full">{displayPicker(p, pickerNames)}</span>)}</div>
                    </div>
                  );
                })()}
              </>
        ) : (
          <div className="mt-3">
            <div className="mb-3">
              <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-2">Comparar pickers (máx 6)</div>
              <div className="flex flex-wrap gap-1.5">
                {rankingData.map((r, ci) => {
                  const isSel = selectedPickers.includes(r.picker);
                  const color = LINE_COLORS[isSel ? selectedPickers.indexOf(r.picker) : ci % LINE_COLORS.length];
                  return (
                    <button key={r.picker} onClick={() => { if (isSel) setSelectedPickers(p => p.filter(x => x !== r.picker)); else if (selectedPickers.length < 6) setSelectedPickers(p => [...p, r.picker]); }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold border cursor-pointer transition-all ${isSel && selectedPickers.length > 0 ? 'text-white border-transparent' : 'bg-bg-2 border-border text-text-2'}`}
                      style={isSel && selectedPickers.length > 0 ? { background: color, borderColor: color } : {}}>
                      <div className="w-2 h-2 rounded-full" style={{ background: isSel && selectedPickers.length > 0 ? 'white' : color }} />
                      {displayPicker(r.picker, pickerNames).replace('Pickers ', 'P.')}
                    </button>
                  );
                })}
                {selectedPickers.length > 0 && <button onClick={() => setSelectedPickers([])} className="px-2.5 py-1 rounded-full text-[11px] text-text-3 border border-border bg-white cursor-pointer">Todos</button>}
              </div>
            </div>
            <div className="bg-white border border-border rounded-card p-3 mb-3" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
              <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-2">% bueno por semana</div>
              <LineChart trends={weeklyTrends} selectedPickers={selectedPickers.length > 0 ? selectedPickers : rankingData.slice(0, 6).map(r => r.picker)} />
            </div>
            <div className="flex flex-wrap gap-2">
              {(selectedPickers.length > 0 ? selectedPickers : rankingData.slice(0, 6).map(r => r.picker)).map((p, ci) => (
                <div key={p} className="flex items-center gap-1.5 text-[11px]">
                  <div className="w-3 h-1.5 rounded-full" style={{ background: LINE_COLORS[ci % LINE_COLORS.length] }} />
                  <span className="text-text-2">{displayPicker(p, pickerNames)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
