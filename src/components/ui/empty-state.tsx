import { type LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** 'page' fills the container; 'inline' is more compact */
  variant?: 'page' | 'inline';
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = 'page',
}: EmptyStateProps) {
  const isPage = variant === 'page';

  return (
    <div
      className={[
        'flex flex-col items-center justify-center text-center',
        isPage ? 'h-full min-h-[240px] p-8' : 'py-10 px-6',
      ].join(' ')}
    >
      {Icon && (
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'rgba(26,37,80,0.07)' }}
        >
          <Icon size={26} className="text-text-3" strokeWidth={1.5} />
        </div>
      )}

      <h3
        className="font-barlow-condensed font-bold uppercase tracking-wide mb-1"
        style={{ fontSize: 16, color: '#1A2550' }}
      >
        {title}
      </h3>

      {description && (
        <p className="text-text-3 text-[13px] max-w-[280px] leading-relaxed mb-4">
          {description}
        </p>
      )}

      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
