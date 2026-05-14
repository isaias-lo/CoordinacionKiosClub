import { Suspense } from 'react';
import { RecepcionTiendaScreen } from '../../features/tiendas/RecepcionTiendaScreen';

export default function TiendasPage() {
  return (
    <Suspense>
      <RecepcionTiendaScreen />
    </Suspense>
  );
}
