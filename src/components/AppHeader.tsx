'use client';

import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';
import { useAuth } from './AuthProvider';

const LOGO_SRC = '/logo.png';

interface AppHeaderProps {
  onFinish: () => void;
}

export function AppHeader({ onFinish }: AppHeaderProps) {
  const { state } = useApp();
  const router = useRouter();
  const { signOut } = useAuth();

  const confirmBackHome = () => {
    const totalItems = Object.values(state.dispatch).reduce((acc, items) => acc + items.length, 0);
    if (totalItems > 0) {
      if (!confirm('¿Volver al inicio? Los datos no guardados se perderán.')) return;
    }
    router.push('/');
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-navy gap-2.5 flex-shrink-0"
         style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.25)' }}>
      <img src={LOGO_SRC} className="h-7 brightness-0 invert" alt="KiosClub"
           onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      <div className="font-barlow-condensed text-[13px] text-white/60 tracking-wide flex-1 text-center">
        {state.dispatchDate}
      </div>
      <button
        onClick={confirmBackHome}
        className="px-4 py-2 bg-white/12 text-white border border-white/20 rounded-full font-barlow-condensed text-[15px] font-bold tracking-widest uppercase cursor-pointer whitespace-nowrap transition-all active:bg-white/20">
        INICIO
      </button>
      <button
        onClick={() => { sessionStorage.setItem('despacho_from', '/despacho/regiones'); router.push('/despacho'); }}
        className="px-4 py-2 bg-white/12 text-white border border-white/20 rounded-full font-barlow-condensed text-[15px] font-bold tracking-widest uppercase cursor-pointer whitespace-nowrap transition-all active:bg-white/20">
        Despacho
      </button>
      <button
        onClick={onFinish}
        className="px-3.5 py-1.5 bg-red text-white border-none rounded-full font-barlow-condensed text-[13px] font-bold tracking-wide cursor-pointer whitespace-nowrap transition-all active:bg-red-dark">
        ✓ Terminar
      </button>
      <button
        onClick={async () => { await signOut(); router.push('/login'); }}
        className="px-3.5 py-1.5 bg-white/8 text-white/50 border border-white/15 rounded-full font-barlow-condensed text-[13px] font-bold tracking-wide cursor-pointer whitespace-nowrap transition-all hover:text-white/80 hover:bg-white/15">
        Salir
      </button>
    </div>
  );
}
