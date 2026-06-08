'use client';

import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { Skeleton } from '../ui/skeleton';

export type HubModuleEntry = {
  id: string;
  path: string;
  label: string;
  sub: string;
  color: string;
  Icon: LucideIcon;
  /** Número de notificaciones/alertas a mostrar como badge naranja */
  badge?: number;
  /** Texto de estado en vivo (ej: "3 pendientes") */
  status?: string;
  onClick: () => void;
};

interface HubPageProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  modules: HubModuleEntry[];
  /** Muestra skeletons mientras el perfil carga */
  loading?: boolean;
  /** Cuántos skeletons mostrar (default: 6) */
  skeletonCount?: number;
}

function HubCardSkeleton() {
  return (
    <div
      className="bg-card rounded-card border border-border/60 p-4"
      style={{ borderLeftWidth: 3, borderLeftColor: '#E8E8ED' }}
    >
      <Skeleton className="w-9 h-9 rounded-xl mb-3" />
      <Skeleton className="h-4 w-3/4 mb-2" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function HubPage({
  title,
  subtitle,
  backHref,
  modules,
  loading,
  skeletonCount = 6,
}: HubPageProps) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PageHeader title={title} subtitle={subtitle} backHref={backHref} />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl">
          {loading
            ? Array.from({ length: skeletonCount }, (_, i) => <HubCardSkeleton key={i} />)
            : modules.map(m => (
                <button
                  key={m.id}
                  onClick={m.onClick}
                  className="group relative bg-card rounded-card border border-border/60 p-4 text-left transition-all hover:shadow-card2 hover:-translate-y-0.5 active:scale-[0.99]"
                  style={{ borderLeftWidth: 3, borderLeftColor: m.color }}
                >
                  {m.badge !== undefined && m.badge > 0 && (
                    <span
                      className="absolute top-3 right-3 text-[11px] font-bold text-white px-2 py-0.5 rounded-full"
                      style={{ background: '#FF9500' }}
                    >
                      {m.badge}
                    </span>
                  )}

                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                    style={{ background: `${m.color}18` }}
                  >
                    <m.Icon size={18} strokeWidth={1.8} style={{ color: m.color }} />
                  </div>

                  <div className="font-barlow-condensed text-[17px] font-bold text-text uppercase tracking-wide leading-tight pr-4">
                    {m.label}
                  </div>
                  <div className="text-[12px] text-text-3 mt-1 leading-snug">{m.sub}</div>

                  {m.status && (
                    <div
                      className="mt-2 text-[11px] font-semibold"
                      style={{ color: m.color }}
                    >
                      {m.status}
                    </div>
                  )}

                  <ChevronRight
                    size={14}
                    className="absolute bottom-4 right-4 text-text-3 group-hover:text-text-2 transition-colors"
                    strokeWidth={2}
                  />
                </button>
              ))}
        </div>
      </div>
    </div>
  );
}
