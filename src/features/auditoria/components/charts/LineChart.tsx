'use client';

import { useMemo } from 'react';
import { LINE_COLORS } from '../../constants';

export interface WeekTrend { key: string; label: string; pct: number | null }

export function LineChart({ trends, selectedPickers }: { trends: Map<string, WeekTrend[]>; selectedPickers: string[] }) {
  const W = 320, H = 160, pL = 36, pB = 22, pR = 12, pT = 10;
  const allWeeks = useMemo(() => { const keys = new Set<string>(); trends.forEach(pts => pts.forEach(p => keys.add(p.key))); return Array.from(keys).sort(); }, [trends]);
  if (allWeeks.length === 0) return <div className="text-center py-8 text-text-3 text-[12px]">Sin datos suficientes para mostrar tendencia.</div>;
  const plotW = W - pL - pR; const plotH = H - pT - pB;
  const xStep = allWeeks.length > 1 ? plotW / (allWeeks.length - 1) : 0;
  const xOf = (i: number) => pL + i * xStep;
  const yOf = (pct: number) => pT + plotH - (pct / 100) * plotH;
  const weekLabels = allWeeks.map(k => { for (const pts of trends.values()) { const f = pts.find(p => p.key === k); if (f) return f.label; } return k.slice(5); });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 160 }}>
      {[0, 25, 50, 75, 100].map(y => (
        <g key={y}><line x1={pL} y1={yOf(y)} x2={W - pR} y2={yOf(y)} stroke="#e5e7eb" strokeWidth={y === 0 || y === 100 ? 1.5 : 0.8} /><text x={pL - 4} y={yOf(y) + 3.5} textAnchor="end" fontSize="9" fill="#9ca3af">{y}%</text></g>
      ))}
      {weekLabels.map((lbl, i) => <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#9ca3af">{lbl}</text>)}
      {selectedPickers.map((picker, ci) => {
        const pts = trends.get(picker); if (!pts) return null;
        const color = LINE_COLORS[ci % LINE_COLORS.length];
        let path = '';
        allWeeks.forEach((wk, i) => { const pt = pts.find(p => p.key === wk); if (pt?.pct !== null && pt?.pct !== undefined) path += path ? ` L${xOf(i)},${yOf(pt.pct)}` : `M${xOf(i)},${yOf(pt.pct)}`; });
        return (
          <g key={picker}>
            {path && <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
            {allWeeks.map((wk, i) => { const pt = pts.find(p => p.key === wk); if (pt?.pct === null || pt?.pct === undefined) return null; return <g key={wk}><circle cx={xOf(i)} cy={yOf(pt.pct)} r="4.5" fill={color} opacity="0.15" /><circle cx={xOf(i)} cy={yOf(pt.pct)} r="3" fill={color} /><circle cx={xOf(i)} cy={yOf(pt.pct)} r="1.5" fill="white" /><text x={xOf(i)} y={yOf(pt.pct) - 7} textAnchor="middle" fontSize="9" fill={color} fontWeight="bold">{pt.pct}%</text></g>; })}
          </g>
        );
      })}
    </svg>
  );
}
