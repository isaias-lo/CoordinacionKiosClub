import { Suspense } from 'react';
import { MisSolicitudes } from '@/features/mantencion/tienda/MisSolicitudes';

export const dynamic = 'force-dynamic';

export default function MantencionTiendaPage() {
  return (
    <Suspense fallback={null}>
      <MisSolicitudes />
    </Suspense>
  );
}
