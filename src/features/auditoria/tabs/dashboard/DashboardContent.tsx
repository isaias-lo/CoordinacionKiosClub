'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  fetchParametros, fetchProduccionMes, fetchProduccionHoy,
  computeMetricas, semaforo, calcIndiceEquidad,
  BONO_LABEL, BONO_COLOR, BONO_BG,
  todayISO as metricasTodayISO, fechaCLtoISO, mesActualISO,
} from '../../utils/metricas';
import type { Parametros } from '../../utils/metricas';
import type { AuditEntry, CorreccionAuditoria } from '../../types';
import { CORR_COLORS, CORR_LABEL } from '../../constants';
import { parseEsCL, displayPicker } from './helpers';

type DashPeriod = 'hoy' | 'semana' | 'mes' | 'total';
const PERIOD_LABELS: Record<DashPeriod, string> = { hoy: 'Hoy', semana: '7 días', mes: '30 días', total: 'Total' };

export function DashboardContent({ history, today, pickerNames }: { history: AuditEntry[]; today: string; pickerNames: Record<string, string> }) {
  const [period, setPeriod] = useState<DashPeriod>('hoy');
  const [params, setParams] = useState<Parametros | null>(null);
  const [resumen, setResumen] = useState<ReturnType<typeof computeMetricas> | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // Cargar parámetros y producción al montar o cambiar period
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingMetrics(true);
      const [p, prodMes, prodHoy] = await Promise.all([
        fetchParametros(),
        fetchProduccionMes(new Date()),
        fetchProduccionHoy(),
      ]);
      if (cancelled) return;
      setParams(p);
      const todayIso = metricasTodayISO();
      setResumen(computeMetricas(history, prodMes, prodHoy, p, todayIso));
      setLoadingMetrics(false);
    }
    load();
    return () => { cancelled = true; };
  }, [history]);

  const entries = useMemo(() => {
    if (period === 'hoy') return history.filter(e => e.fecha === today);
    if (period === 'total') return history;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (period === 'semana' ? 7 : 30));
    return history.filter(e => { const d = parseEsCL(e.fecha); return d !== null && d >= cutoff; });
  }, [history, period, today]);

  // Entradas del mes actual
  const entriesMes = useMemo(() => {
    const { from, to } = mesActualISO();
    return history.filter(e => { const iso = fechaCLtoISO(e.fecha); return iso >= from && iso <= to; });
  }, [history]);

  const buenosH = entries.filter(e => e.resultado === 'bueno').length;
  const pct = entries.length ? Math.round((buenosH / entries.length) * 100) : 0;
  const palletsH = entries.reduce((s, e) => s + e.pallets, 0);
  const erroresH = entries.filter(e => e.tieneErrores).length;

  const tiendaErrMap = new Map<string, number>();
  entries.forEach(e => { if (e.resultado === 'malo') tiendaErrMap.set(e.tiendaNombre, (tiendaErrMap.get(e.tiendaNombre) ?? 0) + 1); });
  const topErrTiendas = Array.from(tiendaErrMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const corrBreak = { correcto: 0, faltante: 0, sobrante: 0, cruce: 0 } as Record<CorreccionAuditoria, number>;
  entries.forEach(e => corrBreak[e.correccion]++);

  const periodSelector = (
    <div className="flex gap-1 mb-3">
      {(Object.keys(PERIOD_LABELS) as DashPeriod[]).map(p => (
        <button key={p} onClick={() => setPeriod(p)}
          className="flex-1 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-all border-none"
          style={period === p ? { background: '#1a2550', color: '#fff' } : { background: 'rgba(26,37,80,0.07)', color: '#6B7280' }}>
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );

  /* ── Vista HOY ── */
  if (period === 'hoy') {
    const minimo = params?.minimo_auditorias ?? 73;
    return (
      <div className="p-4 space-y-3">
        {periodSelector}

        {/* Cobertura global del día */}
        {resumen && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Producidos', value: resumen.total_producidos, color: '#1a2550' },
              { label: 'Auditados', value: resumen.total_auditados, color: '#2563EB' },
              { label: 'Cobertura', value: resumen.total_producidos > 0 ? `${resumen.cobertura_global}%` : '—', color: resumen.cobertura_global >= (params?.cobertura_diaria_meta ?? 30) ? '#16A34A' : '#D97706' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-card p-3 text-center border border-border" style={{ background: 'rgba(26,37,80,0.04)', boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
                <div className="font-barlow-condensed text-[28px] font-extrabold leading-tight" style={{ color }}>{value}</div>
                <div className="text-[10px] text-text-3 uppercase tracking-wide mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabla de prioridad */}
        {loadingMetrics ? (
          <div className="text-center py-6 text-text-3 text-[12px]">Cargando métricas…</div>
        ) : resumen && resumen.pickers.length > 0 ? (
          <div className="bg-white border border-border rounded-card overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <span className="text-[15px]">🎯</span>
              <span className="font-barlow-condensed text-[15px] font-bold text-navy">Prioridad de auditoría hoy</span>
            </div>
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'rgba(26,37,80,0.04)' }}>
                    {['Picker', 'Prod.hoy', 'Audit.hoy', 'Cuota', 'Mes', 'Faltan', 'Hoy'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#6B7280', letterSpacing: '0.05em', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resumen.pickers.map((m, i) => {
                    const s = semaforo(m);
                    const dot = s === 'rojo' ? '#D32F2F' : s === 'amarillo' ? '#D97706' : '#16A34A';
                    return (
                      <tr key={m.picker_nombre} style={{ borderBottom: i < resumen.pickers.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600, color: '#1a2550' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0, display: 'inline-block' }} />
                            <span style={{ fontSize: 12 }}>{m.picker_nombre}</span>
                          </div>
                        </td>
                        <td style={{ padding: '6px 8px', color: '#374151' }}>{m.producidos_hoy || '—'}</td>
                        <td style={{ padding: '6px 8px', color: '#374151' }}>{m.auditados_hoy || '—'}</td>
                        <td style={{ padding: '6px 8px', color: '#374151' }}>{m.producidos_hoy > 0 ? m.cuota_hoy : '—'}</td>
                        <td style={{ padding: '6px 8px', color: '#374151' }}>{m.auditados_mes}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 700, color: m.deficit > 0 ? '#D32F2F' : '#16A34A' }}>{m.deficit > 0 ? m.deficit : '✓'}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 700 }}>
                          {m.necesarios_hoy > 0
                            ? <span style={{ background: s === 'rojo' ? 'rgba(211,47,47,0.10)' : 'rgba(217,119,6,0.10)', color: dot, padding: '2px 7px', borderRadius: 6, fontSize: 11 }}>{m.necesarios_hoy}</span>
                            : <span style={{ color: '#16A34A' }}>✓</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 flex gap-4 border-t border-border text-[10px] text-text-3">
              <span><span style={{ color: '#16A34A' }}>●</span> Cumplió mínimo</span>
              <span><span style={{ color: '#D97706' }}>●</span> Pendiente</span>
              <span><span style={{ color: '#D32F2F' }}>●</span> Urgente (después 15:00)</span>
              <span>Mínimo mensual: <strong>{minimo}</strong> pallets</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-text-3 text-[12px]">Sin datos de producción para hoy. Registra producción en la sección correspondiente.</div>
        )}

        {/* KPI rápidos de auditorías de hoy */}
        {entries.length > 0 && (
          <>
            <div className="text-[11px] text-text-3 text-center">{entries.length} auditorías registradas hoy</div>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: '% Aprobación', value: `${pct}%`, color: pct >= 80 ? '#16A34A' : pct >= 60 ? '#D97706' : '#D32F2F', bg: pct >= 80 ? 'rgba(22,163,74,0.08)' : pct >= 60 ? 'rgba(217,119,6,0.08)' : 'rgba(211,47,47,0.08)' },
                { label: 'Con errores', value: erroresH, color: erroresH > 0 ? '#D32F2F' : '#16A34A', bg: erroresH > 0 ? 'rgba(211,47,47,0.07)' : 'rgba(22,163,74,0.07)' },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className="rounded-card p-3.5 text-center border border-border" style={{ background: bg, boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
                  <div className="font-barlow-condensed text-[34px] font-extrabold leading-tight" style={{ color }}>{value}</div>
                  <div className="text-[11px] text-text-3 uppercase tracking-wide mt-1">{label}</div>
                </div>
              ))}
            </div>
            {/* Recent audits */}
            <div className="bg-white border border-border rounded-card p-4" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
              <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-2">Últimas auditorías</div>
              {entries.slice(0, 6).map(e => (
                <div key={e.id} className="flex items-center gap-2.5 py-2 border-b border-border/40 last:border-0">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${e.resultado === 'bueno' ? 'bg-success' : 'bg-red'}`} />
                  <span className="text-[12px] text-text-2 flex-shrink-0 w-10">{e.hora}</span>
                  <span className="text-[13px] font-medium text-text flex-1 truncate">{e.tiendaNombre}</span>
                  {e.picker && <span className="text-[11px] text-text-3 flex-shrink-0">{displayPicker(e.picker, pickerNames)}</span>}
                  <span className={`font-barlow-condensed text-[13px] font-bold flex-shrink-0 ${e.resultado === 'bueno' ? 'text-success' : 'text-red'}`}>{e.resultado === 'bueno' ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  /* ── Vista TOTAL (mes actual) ── */
  if (period === 'total') {
    const minimo = params?.minimo_auditorias ?? 73;
    const indiceEquidad = resumen ? calcIndiceEquidad(resumen.pickers) : null;

    return (
      <div className="p-4 space-y-3">
        {periodSelector}

        {/* Resumen mensual por picker */}
        {loadingMetrics ? (
          <div className="text-center py-6 text-text-3 text-[12px]">Cargando métricas del mes…</div>
        ) : resumen && resumen.pickers.length > 0 ? (
          <>
            <div className="bg-white border border-border rounded-card overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
              <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[15px]">📅</span>
                  <span className="font-barlow-condensed text-[15px] font-bold text-navy">Resumen mensual · mes actual</span>
                </div>
                <span className="text-[11px] text-text-3">Mínimo: {minimo} pallets</span>
              </div>
              <div className="overflow-x-auto">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(26,37,80,0.04)' }}>
                      {['Picker', 'Auditados', 'Cobertura', 'Efectividad', 'Estado bono'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#6B7280', letterSpacing: '0.05em', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.pickers.map((m, i) => (
                      <tr key={m.picker_nombre} style={{ borderBottom: i < resumen.pickers.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                        <td style={{ padding: '7px 8px', fontWeight: 600, color: '#1a2550', fontSize: 12 }}>{m.picker_nombre}</td>
                        <td style={{ padding: '7px 8px', color: '#374151' }}>
                          <span style={{ fontWeight: 700 }}>{m.auditados_mes}</span>
                          <span style={{ color: '#9CA3AF', fontSize: 10, marginLeft: 2 }}>/{minimo}</span>
                        </td>
                        <td style={{ padding: '7px 8px', color: m.cobertura_picker_mes !== null ? '#374151' : '#9CA3AF' }}>
                          {m.cobertura_picker_mes !== null ? `${m.cobertura_picker_mes}%` : '—'}
                        </td>
                        <td style={{ padding: '7px 8px' }}>
                          {m.efectividad_pct !== null && m.auditados_mes >= 20
                            ? <span style={{ fontWeight: 700, color: m.efectividad_pct >= (params?.umbral_bono_pct ?? 95) ? '#16A34A' : '#D32F2F' }}>{m.efectividad_pct}%</span>
                            : <span style={{ color: '#9CA3AF', fontSize: 11 }}>Insuf.</span>}
                        </td>
                        <td style={{ padding: '7px 8px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: BONO_BG[m.estado_bono], color: BONO_COLOR[m.estado_bono] }}>
                            {BONO_LABEL[m.estado_bono]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Índice de equidad */}
            {indiceEquidad !== null && (
              <div className="bg-white border border-border rounded-card p-4" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
                <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-1">Índice de equidad del área</div>
                <div className="flex items-baseline gap-2">
                  <span className="font-barlow-condensed text-[34px] font-extrabold" style={{ color: indiceEquidad <= 15 ? '#16A34A' : indiceEquidad <= 30 ? '#D97706' : '#D32F2F' }}>{indiceEquidad}pp</span>
                  <span className="text-[12px] text-text-3">diferencia cobertura máx − mín · menor es más justo</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-text-3"><div className="text-[40px] mb-3">📊</div><div className="text-[15px] font-barlow-condensed">Sin datos suficientes para el mes actual.</div></div>
        )}

        {/* KPIs del mes desde audit_entries */}
        {entriesMes.length > 0 && (() => {
          const bm = entriesMes.filter(e => e.resultado === 'bueno').length;
          const pm = entriesMes.reduce((s, e) => s + e.pallets, 0);
          const pctm = entriesMes.length ? Math.round((bm / entriesMes.length) * 100) : 0;
          return (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Auditorías', value: entriesMes.length, color: '#1a2550' },
                { label: 'Pallets', value: pm, color: '#2563EB' },
                { label: 'Aprobación', value: `${pctm}%`, color: pctm >= 80 ? '#16A34A' : '#D97706' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-card p-3 text-center border border-border" style={{ background: 'rgba(26,37,80,0.04)' }}>
                  <div className="font-barlow-condensed text-[26px] font-extrabold leading-tight" style={{ color }}>{value}</div>
                  <div className="text-[10px] text-text-3 uppercase tracking-wide mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    );
  }

  /* ── Vista 7D / 30D ── */
  if (entries.length === 0) return (
    <div className="p-4">
      {periodSelector}
      <div className="text-center py-12 text-text-3"><div className="text-[40px] mb-3">📊</div><div className="text-[16px] font-barlow-condensed">Sin auditorías en este período.</div></div>
    </div>
  );

  // Efectividad por picker en el período
  const pickerPeriodMap = new Map<string, { total: number; ok: number; pallets: number; nombre: string }>();
  entries.forEach(e => {
    const nombre = e.pickerNombre?.trim() || displayPicker(e.picker ?? '', pickerNames);
    if (!nombre) return;
    if (!pickerPeriodMap.has(nombre)) pickerPeriodMap.set(nombre, { total: 0, ok: 0, pallets: 0, nombre });
    const s = pickerPeriodMap.get(nombre)!;
    s.total++;
    s.pallets += e.pallets;
    if (!e.tieneErrores) s.ok++;
  });
  const pickerPeriodList = Array.from(pickerPeriodMap.values())
    .map(s => ({ ...s, efectividad: s.total > 0 ? Math.round((s.ok / s.total) * 100) : 0 }))
    .sort((a, b) => b.efectividad - a.efectividad);

  function effColor(v: number) { return v >= 90 ? '#16A34A' : v >= 70 ? '#D97706' : '#D32F2F'; }

  return (
    <div className="p-4 space-y-3">
      {periodSelector}
      <div className="text-[11px] text-text-3 text-center -mt-1">{entries.length} auditorías · {PERIOD_LABELS[period]}</div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { label: 'Auditorías', value: entries.length, color: '#1a2550', bg: 'rgba(26,37,80,0.06)' },
          { label: '% Aprobación', value: `${pct}%`, color: pct >= 80 ? '#16A34A' : pct >= 60 ? '#D97706' : '#D32F2F', bg: pct >= 80 ? 'rgba(22,163,74,0.08)' : pct >= 60 ? 'rgba(217,119,6,0.08)' : 'rgba(211,47,47,0.08)' },
          { label: 'Pallets totales', value: palletsH, color: '#2563EB', bg: 'rgba(37,99,235,0.06)' },
          { label: 'Con errores', value: erroresH, color: erroresH > 0 ? '#D32F2F' : '#16A34A', bg: erroresH > 0 ? 'rgba(211,47,47,0.07)' : 'rgba(22,163,74,0.07)' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="rounded-card p-3.5 text-center border border-border" style={{ background: bg, boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
            <div className="font-barlow-condensed text-[34px] font-extrabold leading-tight" style={{ color }}>{value}</div>
            <div className="text-[11px] text-text-3 uppercase tracking-wide mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Efectividad por picker */}
      {pickerPeriodList.length > 0 && (
        <div className="bg-white border border-border rounded-card overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
          <div className="px-4 py-2.5 border-b border-border">
            <span className="font-barlow-condensed text-[15px] font-bold text-navy">Efectividad por picker</span>
          </div>
          {pickerPeriodList.map(s => (
            <div key={s.nombre} className="px-4 py-3 border-b border-border/40 last:border-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-[13px] text-text">{s.nombre}</span>
                {s.total >= 20
                  ? <span className="font-barlow-condensed text-[18px] font-bold" style={{ color: effColor(s.efectividad) }}>{s.efectividad}%</span>
                  : <span className="text-[11px] text-text-3 italic">Muestra insuficiente</span>}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-bg-2 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${s.efectividad}%`, background: effColor(s.efectividad) }} />
                </div>
                <span className="text-[10px] text-text-3 flex-shrink-0">{s.ok}/{s.total} · {s.pallets}p</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tiendas con más errores */}
      {topErrTiendas.length > 0 && (
        <div className="bg-white border border-border rounded-card p-4" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
          <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-2">Tiendas con más errores</div>
          {topErrTiendas.map(([nombre, n]) => (
            <div key={nombre} className="flex items-center gap-2.5 py-2 border-b border-border/40 last:border-0">
              <div className="w-2.5 h-2.5 bg-red rounded-full flex-shrink-0" />
              <span className="flex-1 text-[13px] text-text font-medium">{nombre}</span>
              <span className="font-barlow-condensed text-[20px] font-bold text-red">{n}×</span>
            </div>
          ))}
        </div>
      )}

      {/* Distribución de correcciones */}
      <div className="bg-white border border-border rounded-card p-4" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
        <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-3">Distribución de correcciones</div>
        <div className="flex rounded-full overflow-hidden h-4 mb-3">
          {(Object.entries(corrBreak) as [CorreccionAuditoria, number][]).filter(([, v]) => v > 0).map(([k, v]) => (
            <div key={k} style={{ flex: v, background: CORR_COLORS[k] }} title={`${CORR_LABEL[k]}: ${v}`} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(corrBreak) as [CorreccionAuditoria, number][]).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: CORR_COLORS[k] }} />
              <span className="text-[12px] text-text-2">{CORR_LABEL[k]}: <strong>{v}</strong></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
