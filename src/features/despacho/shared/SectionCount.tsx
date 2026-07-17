'use client';

import { progressTone } from './storeStatus';

const TONE: Record<'red' | 'yellow' | 'green', string> = {
  red:    '#D32F2F',
  yellow: '#F08A00',
  green:  '#16A34A',
};

interface Props {
  done: number;
  total: number;
  /** true si va sobre un fondo de color (ej. botón activo) → usa blanco para contraste. */
  onColor?: boolean;
  className?: string;
}

/**
 * Pastilla compacta "X/Y" de tiendas terminadas del día por sección (ej. 15/26).
 * Color semáforo rojo→amarillo→verde según el avance. No se renderiza si total = 0.
 */
export function SectionCount({ done, total, onColor = false, className = '' }: Props) {
  if (total <= 0) return null;
  const tone   = progressTone(total, done);
  const color  = TONE[tone === 'none' ? 'red' : tone];
  const safe   = Math.max(0, Math.min(done, total));
  const fg     = onColor ? '#fff' : color;
  const bg     = onColor ? 'rgba(255,255,255,0.22)' : `color-mix(in srgb, ${color} 15%, transparent)`;
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums leading-none ${className}`}
      style={{ background: bg, color: fg }}
      title={`${safe} de ${total} tiendas terminadas hoy`}>
      {safe}/{total}
    </span>
  );
}
