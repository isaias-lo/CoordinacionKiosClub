'use client';

import { progressTone } from './storeStatus';

// Los tonos de estado de Bodega (index.css), que pasan 4,5:1 en claro y oscuro. Los de antes
// (#D32F2F, #F08A00, #16A34A) daban 4:1, 2,4:1 y 3:1 sobre su propio fondo (revisión del 22/10/2026).
const TONE: Record<'red' | 'yellow' | 'green', [string, string]> = {
  red:    ['var(--est-error)', 'var(--est-error-suave)'],
  yellow: ['var(--est-aviso)', 'var(--est-aviso-suave)'],
  green:  ['var(--est-ok)',    'var(--est-ok-suave)'],
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
  const [color, suave] = TONE[tone === 'none' ? 'red' : tone];
  const safe   = Math.max(0, Math.min(done, total));
  const fg     = onColor ? '#fff' : color;
  const bg     = onColor ? 'rgba(255,255,255,0.22)' : suave;
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums leading-none ${className}`}
      style={{ background: bg, color: fg }}
      title={`${safe} de ${total} tiendas terminadas hoy`}>
      {safe}/{total}
    </span>
  );
}
