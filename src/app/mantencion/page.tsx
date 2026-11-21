import { Suspense } from 'react';
import { PanelMantencion } from '@/features/mantencion/panel/PanelMantencion';

export const dynamic = 'force-dynamic';

export default function MantencionPage() {
  return (
    <Suspense fallback={null}>
      <PanelMantencion />
    </Suspense>
  );
}
