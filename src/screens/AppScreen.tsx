'use client';

import { useState } from 'react';
import { AppHeader } from '../components/AppHeader';
import { FinishModal } from '../components/modals/FinishModal';
import { TiendasPage } from '../features/despacho/regiones/pages/TiendasPage';
import { PendingDraftBanner } from '../features/despacho/shared/PendingDraftBanner';
import { BodegaTabs } from '../features/despacho/shared/BodegaTabs';

export function AppScreen() {
  const [finishOpen, setFinishOpen] = useState(false);

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      <AppHeader onFinish={() => setFinishOpen(true)} />

      <BodegaTabs />

      <PendingDraftBanner fuente="regiones" />

      <div className="flex-1 overflow-hidden flex flex-col">
        <TiendasPage />
      </div>

      <FinishModal open={finishOpen} onClose={() => setFinishOpen(false)} />
    </div>
  );
}
