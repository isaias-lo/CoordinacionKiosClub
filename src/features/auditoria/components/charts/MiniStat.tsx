'use client';

export function MiniStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="text-center">
      <div className="font-barlow-condensed font-extrabold text-[22px] leading-tight" style={{ color: color ?? '#1a2550' }}>{value}</div>
      <div className="text-[10px] text-text-3 uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}
