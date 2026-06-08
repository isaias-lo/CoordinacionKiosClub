import { SkeletonPage } from '@/components/ui/skeleton';

export default function AuditoriaAdminLoading() {
  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      <div
        className="flex-shrink-0 flex items-center gap-3 px-4"
        style={{ height: 56, background: 'linear-gradient(135deg, #1a2550 0%, #5b21b6 100%)' }}
      >
        <div className="h-4 w-32 rounded bg-white/10 animate-pulse" />
      </div>
      <div className="flex-1 overflow-hidden p-4">
        <SkeletonPage rows={6} />
      </div>
    </div>
  );
}
