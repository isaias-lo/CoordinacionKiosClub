'use client';

import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AppHeader } from '../components/AppHeader';
import { TabBar } from '../features/despacho-regiones/components/TabBar';
import { BottomBar } from '../features/despacho-regiones/components/BottomBar';
import { FinishModal } from '../components/modals/FinishModal';
import { SheetsModal } from '../components/modals/SheetsModal';
import { TiendasPage } from '../features/despacho-regiones/pages/TiendasPage';
import { ResumenPage } from '../features/despacho-regiones/pages/ResumenPage';

export function AppScreen() {
  const { state, dispatch, showToast } = useApp();
  const [finishOpen, setFinishOpen] = useState(false);
  const [sheetsOpen, setSheetsOpen] = useState(false);

  const clearCurrentTienda = () => {
    if (!state.selectedTienda) return;
    if (!confirm(`¿Limpiar todos los items de ${state.selectedTienda}?`)) return;
    dispatch({ type: 'CLEAR_TIENDA', tienda: state.selectedTienda });
    showToast('Tienda limpiada', '#1A2550');
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      <AppHeader onFinish={() => setFinishOpen(true)} />
      <TabBar />

      <div className="flex-1 overflow-hidden flex flex-col">
        {state.activeTab === 0 && <TiendasPage />}
        {state.activeTab === 1 && <ResumenPage />}
      </div>

      <BottomBar onClear={clearCurrentTienda} />

      <FinishModal open={finishOpen} onClose={() => setFinishOpen(false)} />
      <SheetsModal open={sheetsOpen} onClose={() => setSheetsOpen(false)} />
    </div>
  );
}
