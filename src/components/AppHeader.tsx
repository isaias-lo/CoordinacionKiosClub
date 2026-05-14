'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ProfilePill } from './ProfilePill';

interface AppHeaderProps {
  onFinish: () => void;
}

export function AppHeader({ onFinish }: AppHeaderProps) {
  const { state } = useApp();
  const router = useRouter();

  const confirmBack = (dest: string) => {
    const totalItems = Object.values(state.dispatch).reduce((acc, items) => acc + items.length, 0);
    if (totalItems > 0) {
      if (!confirm('¿Volver? Los datos no guardados se perderán.')) return;
    }
    router.push(dest);
  };

  return (
    <div className="flex items-center px-4 py-3 bg-navy gap-2.5 flex-shrink-0"
         style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.25)' }}>
      <button
        onClick={() => confirmBack('/despacho-hub')}
        className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
        style={{
          width: 36, height: 36,
          background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
        }}>
        <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
      </button>
      <div className="font-barlow-condensed text-[13px] text-white/60 tracking-wide flex-1 text-center">
        {state.dispatchDate}
      </div>
      <button
        onClick={onFinish}
        className="flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
        style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.45)' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
             style={{
               background: 'linear-gradient(145deg, #EF4444, #B91C1C)',
               boxShadow: '0 3px 8px rgba(239,68,68,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
             }}>
          <Check size={14} color="#fff" strokeWidth={2} />
        </div>
        <span className="font-barlow-condensed text-[13px] font-bold tracking-widest uppercase text-white">TERMINAR</span>
      </button>
      <ProfilePill compact />
    </div>
  );
}
