'use client';

import { useMemo } from 'react';
import {
  LineChart as ReLineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Dot,
} from 'recharts';
import { LINE_COLORS } from '../../constants';

export interface WeekTrend { key: string; label: string; pct: number | null }

interface TooltipPayload { name: string; value: number; color: string }
interface CustomTooltipProps { active?: boolean; payload?: TooltipPayload[]; label?: string }

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.10)', fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: '#1a2550', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
          <span style={{ color: '#6B7280' }}>{p.name}:</span>
          <span style={{ fontWeight: 700, color: p.color }}>{p.value}%</span>
        </div>
      ))}
    </div>
  );
}

export function LineChart({ trends, selectedPickers }: { trends: Map<string, WeekTrend[]>; selectedPickers: string[] }) {
  const allWeeks = useMemo(() => {
    const keys = new Set<string>();
    trends.forEach(pts => pts.forEach(p => keys.add(p.key)));
    return Array.from(keys).sort();
  }, [trends]);

  const data = useMemo(() => allWeeks.map(wk => {
    const point: Record<string, string | number | null> = { week: '' };
    for (const pts of trends.values()) {
      const f = pts.find(p => p.key === wk);
      if (f) { point.week = f.label; break; }
    }
    selectedPickers.forEach(picker => {
      const pts = trends.get(picker);
      const f = pts?.find(p => p.key === wk);
      point[picker] = f?.pct ?? null;
    });
    return point;
  }), [allWeeks, trends, selectedPickers]);

  if (allWeeks.length === 0) return (
    <div className="text-center py-8 text-text-3 text-[12px]">Sin datos suficientes para mostrar tendencia.</div>
  );

  return (
    <ResponsiveContainer width="100%" height={160}>
      <ReLineChart data={data} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
        <Tooltip content={<CustomTooltip />} />
        {selectedPickers.map((picker, ci) => (
          <Line
            key={picker}
            type="monotone"
            dataKey={picker}
            stroke={LINE_COLORS[ci % LINE_COLORS.length]}
            strokeWidth={2.5}
            dot={<Dot r={3} fill={LINE_COLORS[ci % LINE_COLORS.length]} />}
            activeDot={{ r: 5 }}
            connectNulls={false}
          />
        ))}
      </ReLineChart>
    </ResponsiveContainer>
  );
}
