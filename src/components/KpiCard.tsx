'use client';

import { type LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Skeleton } from './ui/skeleton';

interface KpiCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  color?: string;        // accent color (border + icon bg)
  /** +12 means +12 units vs yesterday. undefined = no trend shown */
  trend?: number;
  trendLabel?: string;
  loading?: boolean;
  onClick?: () => void;
}

export function KpiCard({
  label, value, icon: Icon, color = '#1B2A6B',
  trend, trendLabel, loading, onClick,
}: KpiCardProps) {
  if (loading) {
    return (
      <div className="bg-card rounded-card p-4 shadow-card border border-border/60">
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-8 w-16 mb-2" />
        <Skeleton className="h-3 w-20" />
      </div>
    );
  }

  const trendPositive = trend !== undefined && trend > 0;
  const trendNegative = trend !== undefined && trend < 0;
  const TrendIcon = trendPositive ? TrendingUp : trendNegative ? TrendingDown : Minus;
  const trendColor = trendPositive ? '#34C759' : trendNegative ? '#D42B2B' : '#8E8E93';

  return (
    <div
      className={[
        'bg-card rounded-card p-4 shadow-card border-l-[3px] flex flex-col gap-2 transition-shadow',
        onClick ? 'cursor-pointer hover:shadow-card2' : '',
      ].join(' ')}
      style={{ borderLeftColor: color, borderTop: '1px solid #E8E8ED', borderRight: '1px solid #E8E8ED', borderBottom: '1px solid #E8E8ED' }}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-3">{label}</span>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18` }}
        >
          <Icon size={14} strokeWidth={2} style={{ color }} />
        </div>
      </div>

      <div className="font-barlow-condensed text-[32px] font-extrabold leading-none" style={{ color: '#1C1C1E' }}>
        {typeof value === 'number' ? value.toLocaleString('es-CL') : value}
      </div>

      {trend !== undefined && (
        <div className="flex items-center gap-1">
          <TrendIcon size={11} style={{ color: trendColor }} strokeWidth={2.5} />
          <span className="text-[11px] font-semibold" style={{ color: trendColor }}>
            {trend > 0 ? '+' : ''}{trend}
          </span>
          {trendLabel && (
            <span className="text-[11px] text-text-3">{trendLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
