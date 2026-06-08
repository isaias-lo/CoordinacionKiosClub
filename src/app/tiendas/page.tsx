import { Suspense } from 'react';
import { RecepcionTiendaScreen } from '../../features/tiendas/RecepcionTiendaScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function TiendasPage() {
  return (
    <ErrorBoundary module="Tiendas">
      <Suspense>
        <RecepcionTiendaScreen backPath="/panel-choferes" />
      </Suspense>
    </ErrorBoundary>
  );
}
