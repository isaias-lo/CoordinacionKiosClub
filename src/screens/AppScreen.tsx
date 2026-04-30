'use client';

import { useState } from 'react';
import { AppHeader } from '../components/AppHeader';
import { FinishModal } from '../components/modals/FinishModal';
import { TiendasPage } from '../features/despacho-regiones/pages/TiendasPage';

export function AppScreen() {
  const [finishOpen, setFinishOpen] = useState(false);

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      <AppHeader onFinish={() => setFinishOpen(true)} />

      <div className="flex-1 overflow-hidden flex flex-col">
        <TiendasPage />
      </div>

      <FinishModal open={finishOpen} onClose={() => setFinishOpen(false)} />
    </div>
  );
}
