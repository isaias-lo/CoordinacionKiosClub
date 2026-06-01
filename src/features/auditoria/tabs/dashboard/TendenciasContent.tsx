'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { LINE_COLORS } from '../../constants';
import type { AuditEntry } from '../../types';

const ERR_COLOR = (pct: number) => pct >= 60 ? '#D32F2F' : pct >= 30 ? '#D97706' : '#16A34A';

interface TooltipPayload { name: string; value: number; color: string; payload: Record<string, number> }
interface CustomTooltipProps { active?: boolean; payload?: TooltipPayload[]; label?: string }

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.10)', fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: '#1a2550', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: ERR_COLOR(p.value), display: 'inline-block' }} />
          <span style={{ color: '#6B7280' }}>{p.name}:</span>
          <span style={{ fontWeight: 700, color: ERR_COLOR(p.value) }}>{p.value}%</span>
          {p.payload[`${p.name}_total`] != null && (
            <span style={{ color: '#9CA3AF', fontSize: 10 }}>({p.payload[`${p.name}_total`]}a)</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function TendenciasContent({ history, pickerNames }: { history: AuditEntry[]; pickerNames: Record<string, string> }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString('es-CL');
  });

  const recent = history.filter(e => days.includes(e.fecha));

  const pickerMap = new Map<string, { day: string; total: number; errores: number }[]>();
  for (const e of recent) {
    const name = e.pickerNombre?.trim() || (e.picker ? (pickerNames[e.picker] || e.picker) : null);
    if (!name) continue;
    if (!pickerMap.has(name)) pickerMap.set(name, []);
    const arr = pickerMap.get(name)!;
    const existing = arr.find(x => x.day === e.fecha);
    if (existing) { existing.total++; if (e.tieneErrores) existing.errores++; }
    else arr.push({ day: e.fecha, total: 1, errores: e.tieneErrores ? 1 : 0 });
  }

  const pickers = Array.from(pickerMap.entries())
    .map(([name, data]) => ({ name, total: data.reduce((s, d) => s + d.total, 0), data }))
    .sort((a, b) => b.total - a.total).slice(0, 6);

  if (pickers.length === 0) return (
    <div className="p-6 text-center">
      <div className="text-[48px] mb-3">📈</div>
      <div className="font-barlow-condensed text-[18px] font-bold text-text-2">Sin datos esta semana</div>
      <div className="text-[13px] text-text-3 mt-1 max-w-xs mx-auto">Registra auditorías y aparecerán las tendencias de los últimos 7 días.</div>
    </div>
  );

  // Construir data para recharts: un punto por día, columnas por picker
  const dayLabels = days.map(d => { const [day, month] = d.split('/'); return `${day}/${month}`; });
  const chartData = days.map((day, di) => {
    const point: Record<string, number | string> = { label: dayLabels[di] };
    pickers.forEach(({ name, data }) => {
      const d = data.find(x => x.day === day);
      point[name] = d ? Math.round((d.errores / d.total) * 100) : 0;
      point[`${name}_total`] = d?.total ?? 0;
    });
    return point;
  });

  // Vista por picker individual (barras simples, color semáforo)
  const pickerSummary = pickers.map(({ name, data }) => {
    const valid = data.filter(d => d.total > 0);
    const avg = valid.length > 0 ? Math.round(valid.reduce((s, d) => s + (d.errores / d.total) * 100, 0) / valid.length) : 0;
    return { name, avg, total: data.reduce((s, d) => s + d.total, 0) };
  });

  return (
    <div className="p-4 space-y-4 overflow-y-auto flex-1">
      <div className="text-[11px] font-bold text-text-3 uppercase tracking-widest">Últimos 7 días · % auditorías con error por picker</div>

      {/* Gráfico agrupado por día */}
      <div className="bg-white border border-border rounded-card p-4" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
        <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-3">Tendencia diaria (% error)</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} barCategoryGap="28%" barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <ReferenceLine y={60} stroke="#D32F2F" strokeDasharray="4 3" strokeWidth={1} />
            <ReferenceLine y={30} stroke="#D97706" strokeDasharray="4 3" strokeWidth={1} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(26,37,80,0.04)' }} />
            {pickers.map(({ name }, ci) => (
              <Bar key={name} dataKey={name} fill={LINE_COLORS[ci % LINE_COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={18} />
            ))}
          </BarChart>
        </ResponsiveContainer>

        {/* Leyenda */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          {pickers.map(({ name }, ci) => (
            <div key={name} className="flex items-center gap-1.5 text-[11px]">
              <div className="w-3 h-2 rounded-sm" style={{ background: LINE_COLORS[ci % LINE_COLORS.length] }} />
              <span className="text-text-2">{name.split(' ')[0]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Promedio semanal por picker */}
      <div className="bg-white border border-border rounded-card overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
        <div className="px-4 py-2.5 border-b border-border">
          <span className="text-[11px] font-bold text-text-3 uppercase tracking-wide">Promedio semanal de error</span>
        </div>
        <ResponsiveContainer width="100%" height={pickers.length * 42 + 20}>
          <BarChart data={pickerSummary} layout="vertical" margin={{ top: 10, right: 40, left: 8, bottom: 8 }}>
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#1a2550', fontWeight: 600 }} axisLine={false} tickLine={false} width={72}
              tickFormatter={n => n.split(' ')[0]} />
            <ReferenceLine x={60} stroke="#D32F2F" strokeDasharray="4 3" strokeWidth={1} />
            <ReferenceLine x={30} stroke="#D97706" strokeDasharray="4 3" strokeWidth={1} />
            <Tooltip formatter={(v: unknown) => [`${v}%`, '% error']} cursor={{ fill: 'rgba(26,37,80,0.04)' }} />
            <Bar dataKey="avg" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {pickerSummary.map(({ name, avg }) => (
                <Cell key={name} fill={ERR_COLOR(avg)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-4 flex-wrap">
        {[['#16A34A', '0–29%', 'Bueno'], ['#D97706', '30–59%', 'Regular'], ['#D32F2F', '≥60%', 'Crítico']].map(([c, r, l]) => (
          <div key={l} className="flex items-center gap-1.5 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0" style={{ background: c }} />
            <span className="text-text-3 font-semibold">{r} {l}</span>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-text-3 text-center">{recent.length} auditorías en los últimos 7 días · {pickers.length} pickers activos</div>
    </div>
  );
}
