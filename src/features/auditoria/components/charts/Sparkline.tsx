'use client';

export function Sparkline({ points, color }: { points: (number | null)[]; color: string }) {
  const W = 64, H = 24, pad = 3;
  const valid = points.filter((p): p is number => p !== null);
  if (valid.length < 2) return null;
  const step = (W - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => p !== null ? { x: pad + i * step, y: pad + (1 - p / 100) * (H - pad * 2) } : null);
  const d = coords.reduce<string>((acc, pt, i) => {
    if (!pt) return acc;
    const prev = coords.slice(0, i).reverse().find(Boolean);
    return acc + (prev ? `L${pt.x},${pt.y}` : `M${pt.x},${pt.y}`);
  }, '');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ overflow: 'visible' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.7" />
      {coords.map((pt, i) => pt && <circle key={i} cx={pt.x} cy={pt.y} r="2" fill={color} />)}
    </svg>
  );
}
