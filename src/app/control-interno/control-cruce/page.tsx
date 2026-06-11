import { ErrorBoundary } from '@/components/ErrorBoundary';
import ControlCruceContent from '@/features/control-interno/ControlCruceContent';

export default function ControlCrucePage() {
  return (
    <ErrorBoundary module="Control Cruce">
      <ControlCruceContent />
    </ErrorBoundary>
  );
}
