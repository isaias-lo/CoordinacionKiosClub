'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export interface BreadcrumbItem {
  label: string;
  /** Si se omite, el ítem es el actual (no clickeable) */
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Breadcrumb trail mostrado debajo del título */
  breadcrumbs?: BreadcrumbItem[];
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
  breadcrumbs,
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

  const hasSub = !!subtitle || (breadcrumbs && breadcrumbs.length > 0);

  return (
    <header
      className={`flex items-center gap-3 px-4 flex-shrink-0 ${className}`}
      style={{
        height: hasSub ? 64 : 56,
        background: 'var(--gradient-dark-h)',
        borderBottom: '1px solid var(--border-subtle)',
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

        {subtitle && !breadcrumbs && (
          <p className="text-[11px] text-white/40 font-medium uppercase tracking-wider mt-0.5 leading-none">
            {subtitle}
          </p>
        )}

        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 mt-0.5">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight size={9} className="text-white/20 flex-shrink-0" strokeWidth={2.5} />
                )}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="text-[10px] text-white/40 hover:text-white/70 font-medium uppercase tracking-wider leading-none transition-colors whitespace-nowrap"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-[10px] text-white/60 font-medium uppercase tracking-wider leading-none whitespace-nowrap">
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
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
