import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-border/60', className)}
      {...props}
    />
  );
}

/** Pre-built skeleton for a typical data row */
function SkeletonRow({ cols = 3 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-3 p-3">
      <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      {cols > 2 && <Skeleton className="h-6 w-16 rounded-full" />}
    </div>
  );
}

/** Pre-built skeleton for a card */
function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-card bg-card p-4 shadow-card space-y-3">
      <Skeleton className="h-4 w-1/2" />
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: `${85 - i * 15}%` }} />
      ))}
    </div>
  );
}

/** Full-page loading skeleton */
function SkeletonPage({ rows = 5 }: { rows?: number }) {
  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-28 rounded-btn" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

export { Skeleton, SkeletonRow, SkeletonCard, SkeletonPage };
