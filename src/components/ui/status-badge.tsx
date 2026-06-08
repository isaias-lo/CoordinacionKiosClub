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

const STATUS_MAP: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  pendiente:    { label: 'Pendiente',    dot: '#D97706', bg: 'rgba(217,119,6,0.12)',   text: '#92400E' },
  'en-progreso':{ label: 'En Progreso',  dot: '#2563EB', bg: 'rgba(37,99,235,0.10)',   text: '#1D4ED8' },
  completado:   { label: 'Completado',   dot: '#16A34A', bg: 'rgba(22,163,74,0.10)',   text: '#15803D' },
  error:        { label: 'Error',        dot: '#D32F2F', bg: 'rgba(211,47,47,0.10)',   text: '#B71C1C' },
  cancelado:    { label: 'Cancelado',    dot: '#6B7280', bg: 'rgba(107,114,128,0.10)', text: '#4B5563' },
  activo:       { label: 'Activo',       dot: '#16A34A', bg: 'rgba(22,163,74,0.10)',   text: '#15803D' },
  inactivo:     { label: 'Inactivo',     dot: '#6B7280', bg: 'rgba(107,114,128,0.10)', text: '#4B5563' },
};

interface StatusBadgeProps {
  status: Status;
  /** Custom label override */
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusBadge({ status, label, size = 'md', className }: StatusBadgeProps) {
  const config = STATUS_MAP[status] ?? {
    label: status,
    dot:  '#6B7280',
    bg:   'rgba(107,114,128,0.10)',
    text: '#4B5563',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]',
        className,
      )}
      style={{ background: config.bg, color: config.text }}
    >
      <span
        className="rounded-full flex-shrink-0"
        style={{ width: size === 'sm' ? 5 : 6, height: size === 'sm' ? 5 : 6, background: config.dot }}
      />
      {label ?? config.label}
    </span>
  );
}
