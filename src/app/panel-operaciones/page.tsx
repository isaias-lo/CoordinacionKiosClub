import PanelOperaciones from '@/features/panel-operaciones/PanelOperaciones';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function PanelOperacionesPage() {
  return (
    <ErrorBoundary module="Panel Operaciones">
      <PanelOperaciones />
    </ErrorBoundary>
  );
}
