'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { SantiagoProvider, useSantiago } from '../features/despacho/santiago/context/SantiagoContext';
import { SantiagoPage } from '../features/despacho/santiago/pages/SantiagoPage';
import { ProfilePill } from '../components/ProfilePill';

function SantiagoContent() {
  const router = useRouter();
  const { state, dispatch } = useSantiago();
  const [todayLabel, setTodayLabel] = useState('');
  useEffect(() => {
    const d = new Date();
    setTodayLabel(d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' }));
  }, []);

  // Navegación contextual:
  //   step='regimen' (SECO/CONGELADO) → volver a /despacho/conteo
  //   step='form'    (grilla de tiendas) → volver a step='regimen'
  const handleBack = () => {
    if (state.step === 'form') {
      dispatch({ type: 'BACK_TO_REGIMEN' });
    } else {
      router.push('/despacho/conteo');
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      <div
        className="flex items-center px-4 py-3 bg-navy gap-2 flex-shrink-0"
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
        <div className="flex flex-col items-center flex-1 min-w-0">
          <div className="font-barlow-condensed text-[15px] font-bold text-white/90 tracking-widest uppercase leading-tight">
            METROPOLITANA / COSTA
          </div>
          {todayLabel && (
            <div className="font-barlow-condensed text-[11px] text-white/50 tracking-wide capitalize leading-none mt-0.5">
              {todayLabel}
            </div>
          )}
        </div>
        <button
          onClick={() => router.push('/')}
          className="px-3.5 py-1.5 rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.13)' }}>
          <span className="font-barlow-condensed text-[13px] font-bold tracking-widest uppercase text-white">INICIO</span>
        </button>
        <ProfilePill />
      </div>

      <SantiagoPage />
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
