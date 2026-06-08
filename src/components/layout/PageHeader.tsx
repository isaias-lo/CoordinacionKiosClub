'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** If provided, renders a back button that navigates to this path */
  backHref?: string;
  /** Override back button action */
  onBack?: () => void;
  /** Right-side action buttons */
  actions?: React.ReactNode;
  /** Additional className for the container */
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  onBack,
  actions,
  className = '',
}: PageHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) { onBack(); return; }
    if (backHref) { router.push(backHref); return; }
    router.back();
  };

  return (
    <header
      className={`flex items-center gap-3 px-4 flex-shrink-0 ${className}`}
      style={{
        height: 56,
        background: 'linear-gradient(90deg, #0D1829 0%, #111E38 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {(backHref || onBack) && (
        <button
          onClick={handleBack}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.08] transition-all flex-shrink-0"
        >
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
      )}

      <div className="flex-1 min-w-0">
        <h1 className="font-barlow-condensed text-[18px] font-bold text-white uppercase tracking-wide leading-none truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[11px] text-white/40 font-medium uppercase tracking-wider mt-0.5 leading-none">
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
}
