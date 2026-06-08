import { PickingScreen } from '@/features/picking/PickingScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function PickingPage() {
  return (
    <ErrorBoundary module="Picking">
      <PickingScreen />
    </ErrorBoundary>
  );
}
