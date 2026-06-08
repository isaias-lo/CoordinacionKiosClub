import { RecepcionTiendaCtrlScreen } from '@/features/recepcion-tienda/RecepcionTiendaCtrlScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function RecepcionTiendaPage() {
  return (
    <ErrorBoundary module="Recepción Tienda">
      <RecepcionTiendaCtrlScreen />
    </ErrorBoundary>
  );
}
