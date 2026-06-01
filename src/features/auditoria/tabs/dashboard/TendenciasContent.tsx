'use client';

import { LINE_COLORS } from '../../constants';
import type { AuditEntry } from '../../types';

export function TendenciasContent({ history, pickerNames }: { history: AuditEntry[]; pickerNames: Record<string, string> }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString('es-CL');
  });
  const dayShort = days.map(d => { const [day, month] = d.split('/'); return `${day}/${month}`; });
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

  const barColor = (pct: number) => pct >= 60 ? '#D32F2F' : pct >= 30 ? '#D97706' : '#16A34A';

  if (pickers.length === 0) return (
    <div className="p-6 text-center">
      <div className="text-[48px] mb-3">📈</div>
      <div className="font-barlow-condensed text-[18px] font-bold text-text-2">Sin datos esta semana</div>
      <div className="text-[13px] text-text-3 mt-1 max-w-xs mx-auto">Registra auditorías y aparecerán las tendencias de los últimos 7 días.</div>
    </div>
  );

  return (
    <div className="p-4 space-y-4 overflow-y-auto flex-1">
      <div className="text-[11px] font-bold text-text-3 uppercase tracking-widest">Últimos 7 días · % auditorías con error por picker</div>

      <div className="bg-white border border-border rounded-card overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(26,37,80,0.04)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Picker</th>
                {dayShort.map((d, i) => <th key={i} style={{ textAlign: 'center', padding: '8px 4px', fontSize: 10, fontWeight: 700, color: '#6B7280', minWidth: 40 }}>{d}</th>)}
                <th style={{ textAlign: 'center', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#6B7280' }}>Prom.</th>
              </tr>
            </thead>
            <tbody>
              {pickers.map(({ name, data }, pi) => {
                const color = LINE_COLORS[pi % LINE_COLORS.length];
                const dayStats = days.map(day => {
                  const d = data.find(x => x.day === day);
                  if (!d) return null;
                  return { pct: d.total > 0 ? Math.round((d.errores / d.total) * 100) : 0, total: d.total };
                });
                const valid = dayStats.filter((d): d is { pct: number; total: number } => d !== null);
                const avg = valid.length > 0 ? Math.round(valid.reduce((s, d) => s + d.pct, 0) / valid.length) : 0;
                return (
                  <tr key={name} style={{ borderTop: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#1a2550', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90 }}>{name.split(' ')[0]}</span>
                        <span style={{ fontSize: 10, color: '#9CA3AF' }}>({valid.reduce((s, d) => s + d.total, 0)}a)</span>
                      </div>
                    </td>
                    {dayStats.map((d, i) => (
                      <td key={i} style={{ textAlign: 'center', padding: '6px 4px', verticalAlign: 'bottom' }}>
                        {d ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <div style={{ width: 22, height: 36, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                              <div style={{ width: 14, height: `${Math.max(d.pct, 4)}%`, maxHeight: 36, background: barColor(d.pct), borderRadius: 3, minHeight: 2 }} />
                            </div>
                            <span style={{ fontSize: 9, color: barColor(d.pct), fontWeight: 700 }}>{d.pct}%</span>
                            <span style={{ fontSize: 8, color: '#9CA3AF' }}>{d.total}a</span>
                          </div>
                        ) : <span style={{ fontSize: 12, color: '#E5E7EB' }}>—</span>}
                      </td>
                    ))}
                    <td style={{ textAlign: 'center', padding: '10px 12px', fontSize: 14, fontWeight: 800, color: barColor(avg) }}>
                      {valid.length > 0 ? `${avg}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[['#16A34A', '0–29%', 'Bueno'], ['#D97706', '30–59%', 'Regular'], ['#D32F2F', '≥60%', 'Crítico']].map(([c, r, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: c, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: '#6B7280', fontWeight: 600 }}>{r} {l}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: '#9CA3AF', textAlign: 'center' }}>{recent.length} auditorías en los últimos 7 días · {pickers.length} pickers activos</div>
    </div>
  );
}
