'use client';

export function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[11px] font-semibold text-text-3 uppercase tracking-wider">{label}</span>
        <span className="text-[13px] font-bold" style={{ color }}>{value}%</span>
      </div>
      <div className="h-3 bg-bg-2 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }} />
      </div>
    </div>
  );
}
