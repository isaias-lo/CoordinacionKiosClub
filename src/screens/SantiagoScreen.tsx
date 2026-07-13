'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Check } from 'lucide-react';
import { SantiagoProvider, useSantiago, SANTIAGO_TERMINADO_KEY } from '../features/despacho/santiago/context/SantiagoContext';
import { SantiagoPage } from '../features/despacho/santiago/pages/SantiagoPage';
import { SantiagoFinishModal } from '../features/despacho/santiago/components/SantiagoFinishModal';
import { PendingDraftBanner } from '../features/despacho/shared/PendingDraftBanner';
import { BodegaTabs } from '../features/despacho/shared/BodegaTabs';
import { useAuth } from '../components/AuthProvider';

function SantiagoContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const { state, dispatch } = useSantiago();
  const [modalOpen,    setModalOpen]    = useState(false);
  const [terminated,   setTerminated]   = useState(false);
  const [terminatedAt, setTerminatedAt] = useState('');

  useEffect(() => {
    const val = localStorage.getItem(SANTIAGO_TERMINADO_KEY);
    if (val) { setTerminated(true); setTerminatedAt(val); }
  }, []);

  // Sync terminated state when modal closes after finishing
  useEffect(() => {
    if (!modalOpen) {
      const val = localStorage.getItem(SANTIAGO_TERMINADO_KEY);
      if (val) { setTerminated(true); setTerminatedAt(val); }
    }
  }, [modalOpen]);

  const handleBack = () => {
    if (state.step === 'form') {
      dispatch({ type: 'BACK_TO_REGIMEN' });
    } else {
      const paths = profile?.allowedPaths ?? [];
      const hasConteo = paths.includes('*') || paths.includes('/despacho/conteo');
      router.push(hasConteo ? '/despacho/conteo' : '/');
    }
  };

  // #8: registrado puede venir del modal o de StepResumen (flag sincronizado) o del
  // badge local TERMINADO. Cualquiera marca el header como COMPLETADO → evita re-registro.
  const registered = terminated || state.registrado === true;

  const handleReopen = () => {
    if (!confirm('¿Reabrir el despacho del día? Podrás modificar y volver a registrar.')) return;
    localStorage.removeItem(SANTIAGO_TERMINADO_KEY);
    setTerminated(false);
    setTerminatedAt('');
    dispatch({ type: 'SET_REGISTRADO', payload: false });
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      <div
        className="mobile-menu-safe flex items-center px-4 py-3 bg-navy gap-2 flex-shrink-0"
        style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.25)' }}>
        <button
          onClick={handleBack}
          className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
          style={{
            width: 36, height: 36,
            background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)',
          }}>
          <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
        </button>

        <BodegaTabs />

        {registered ? (
          <button
            onClick={handleReopen}
            title={`Terminado${terminatedAt ? ` a las ${terminatedAt}` : ''} · Toca para reabrir`}
            className="flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
            style={{ background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.50)' }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                 style={{
                   background: 'linear-gradient(145deg, #22C55E, #15803D)',
                   boxShadow: '0 3px 8px rgba(34,197,94,0.45), inset 0 1px 0 rgba(255,255,255,0.25)',
                 }}>
              <Check size={14} color="#fff" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-barlow-condensed text-[12px] font-bold tracking-widest uppercase text-[#86EFAC]">COMPLETADO</span>
              {terminatedAt && <span className="text-[9px] text-white/40 mt-0.5">{terminatedAt}</span>}
            </div>
          </button>
        ) : (
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
            style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.45)' }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                 style={{
                   background: 'linear-gradient(145deg, #EF4444, #B91C1C)',
                   boxShadow: '0 3px 8px rgba(239,68,68,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
                 }}>
              <Check size={14} color="#fff" strokeWidth={2} />
            </div>
            <span className="font-barlow-condensed text-[13px] font-bold tracking-widest uppercase text-white">REGISTRAR</span>
          </button>
        )}

      </div>

      <PendingDraftBanner fuente="santiago" />

      <SantiagoPage />

      <SantiagoFinishModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

export function SantiagoScreen() {
  return (
    <SantiagoProvider>
      <SantiagoContent />
    </SantiagoProvider>
  );
}
