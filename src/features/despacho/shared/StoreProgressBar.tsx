'use client';

import { progressTone } from './storeStatus';

// Semáforo real por avance de movimientos realizados (done/total):
//   sin ops → no se muestra · 0 hechas → rojo · parcial → amarillo · todas → verde.
const TONE_COLOR: Record<'red' | 'yellow' | 'green', string> = {
  red:    '#D32F2F',   // rojo (mismo rojo de la app)
  yellow: '#F08A00',   // naranja vivo (moderado, no neón)
  green:  'var(--status-done)',  // verde
};

interface Props {
  total: number;
  done: number;
  /** grid = tarjeta compacta de bodega · list = fila ancha (Estado) */
  variant?: 'grid' | 'list';
  /** muestra el contador n/m junto a la barra */
  showCount?: boolean;
}

/**
 * Barra de progreso tipo "loading" que se llena según done/total y cambia de color
 * rojo→amarillo→verde a medida que avanza. No se renderiza si la tienda no tiene ops.
 */
export function StoreProgressBar({ total, done, variant = 'grid', showCount = false }: Props) {
  const tone = progressTone(total, done);
  if (tone === 'none') return null;

  const safeDone = Math.max(0, Math.min(done, total));
  const pct      = total > 0 ? Math.round((safeDone / total) * 100) : 0;
  const color    = TONE_COLOR[tone];
  const label    = `${safeDone}/${total}`;
  const title    = `${label} movimientos realizados`;

  return (
    <div className={`flex items-center gap-1.5 w-full ${variant === 'grid' ? 'mt-1' : ''}`} title={title}>
      <div
        className="relative flex-1 rounded-full overflow-hidden"
        style={{
          height: variant === 'list' ? 6 : 5,
          // pista tintada con el tono → el color se ve incluso al 0% (rojo)
          background: `color-mix(in srgb, ${color} 22%, transparent)`,
        }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {showCount && (
        <span
          className={`font-bold tabular-nums leading-none ${variant === 'list' ? 'text-[10px]' : 'text-[9px]'}`}
          style={{ color }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
