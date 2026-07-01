import { cn } from '@/lib/utils';

type Status =
  | 'pendiente'
  | 'en-progreso'
  | 'completado'
  | 'error'
  | 'cancelado'
  | 'activo'
  | 'inactivo'
  | string;

/**
 * Cada estado se define con un color base (`c`). El fondo (12% alpha) y el texto
 * derivan de ese color, de modo que el chip conserva contraste en light y dark
 * sin depender de un color de texto oscuro fijo. `rgb()` permite el alpha en bg.
 */
const STATUS_MAP: Record<string, { label: string; c: string }> = {
  pendiente:    { label: 'Pendiente',   c: '217 119 6'   },
  'en-progreso':{ label: 'En Progreso', c: '37 99 235'   },
  completado:   { label: 'Completado',  c: '22 163 74'   },
  error:        { label: 'Error',       c: '211 47 47'   },
  cancelado:    { label: 'Cancelado',   c: '107 114 128' },
  activo:       { label: 'Activo',      c: '22 163 74'   },
  inactivo:     { label: 'Inactivo',    c: '107 114 128' },
};

interface StatusBadgeProps {
  status: Status;
  /** Custom label override */
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusBadge({ status, label, size = 'md', className }: StatusBadgeProps) {
  const config = STATUS_MAP[status] ?? { label: status, c: '107 114 128' };
  const color = `rgb(${config.c})`;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]',
        className,
      )}
      style={{ background: `rgb(${config.c} / 0.12)`, color }}
    >
      <span
        className="rounded-full flex-shrink-0"
        style={{ width: size === 'sm' ? 5 : 6, height: size === 'sm' ? 5 : 6, background: color }}
      />
      {label ?? config.label}
    </span>
  );
}
