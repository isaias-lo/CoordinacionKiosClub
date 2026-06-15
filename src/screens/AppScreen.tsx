'use client';

import { useState } from 'react';
import { AppHeader } from '../components/AppHeader';
import { FinishModal } from '../components/modals/FinishModal';
import { TiendasPage } from '../features/despacho/regiones/pages/TiendasPage';
import { PendingDraftBanner } from '../features/despacho/shared/PendingDraftBanner';

export function AppScreen() {
  const [finishOpen, setFinishOpen] = useState(false);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: '#0D1829' }}>
      <AppHeader onFinish={() => setFinishOpen(true)} backTo="/despacho/conteo" />

      <PendingDraftBanner fuente="regiones" />

      <div className="flex-1 overflow-hidden flex flex-col">
        <TiendasPage />
      </div>

      <FinishModal open={finishOpen} onClose={() => setFinishOpen(false)} />
    </div>
  );
}
