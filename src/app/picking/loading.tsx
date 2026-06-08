import { SkeletonPage } from '@/components/ui/skeleton';

export default function PickingLoading() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div
        className="flex-shrink-0 flex items-center gap-3 px-4"
        style={{ height: 56, background: 'linear-gradient(90deg, #0D1829 0%, #111E38 100%)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="h-4 w-24 rounded bg-white/10 animate-pulse" />
      </div>
      <div className="flex-1 overflow-hidden">
        <SkeletonPage rows={10} />
      </div>
    </div>
  );
}
