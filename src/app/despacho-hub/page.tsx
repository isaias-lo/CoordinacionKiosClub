'use client';

import { useRouter } from 'next/navigation';
import { useApp } from '../../context/AppContext';

export default function DespachoHubPage() {
  const router = useRouter();
  const { dispatch } = useApp();

  const goToRegiones = () => {
    dispatch({ type: 'CLEAR_ALL' });
    dispatch({ type: 'SET_TIENDA', payload: null });
    dispatch({ type: 'SET_TAB', payload: 0 });
    router.push('/despacho/regiones');
  };

  return (
    <div className="fixed inset-0 flex flex-col px-6 py-10 overflow-y-auto"
         style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

      {/* Back + title */}
      <div className="flex items-center gap-3 mb-10">
        <button
          onClick={() => router.push('/')}
          className="flex items-center justify-center rounded-xl cursor-pointer transition-all active:scale-95"
          style={{ width: 38, height: 38, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <span className="text-white/70 text-lg leading-none">←</span>
        </button>
        <div>
          <div className="font-barlow-condensed text-[11px] font-bold tracking-[0.2em] uppercase text-white/35">Módulo</div>
          <div className="font-barlow-condensed text-2xl font-bold text-white tracking-widest uppercase leading-none">Despacho</div>
        </div>
      </div>

      {/* Grid de tabs */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm mx-auto" style={{ gridAutoRows: '110px' }}>

        <button onClick={goToRegiones}
          className="relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[#B71C1C]"
          style={{ background: '#D32F2F', boxShadow: '0 8px 24px rgba(211,47,47,0.40)' }}>
          <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Bodega Regiones</div>
          <div className="text-xs text-white/60 mt-1">Despacho nacional</div>
        </button>

        <button onClick={() => router.push('/despacho/santiago')}
          className="relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-info/40"
          style={{ background: 'rgba(37,99,235,0.18)', boxShadow: '0 8px 24px rgba(37,99,235,0.25)' }}>
          <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Bodega Santiago</div>
          <div className="text-xs text-white/60 mt-1">Despacho local RM</div>
        </button>

        <button onClick={() => router.push('/despacho')}
          className="relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[rgba(34,197,94,0.50)]"
          style={{ background: 'rgba(34,197,94,0.16)', boxShadow: '0 8px 24px rgba(34,197,94,0.20)' }}>
          <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Enrutador</div>
          <div className="text-xs text-white/60 mt-1">Sistema de enrutamiento</div>
        </button>

        <button onClick={() => router.push('/despacho/estado')}
          className="relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[rgba(245,158,11,0.50)]"
          style={{ background: 'rgba(245,158,11,0.13)', boxShadow: '0 8px 24px rgba(245,158,11,0.18)' }}>
          <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Estado / Seguimiento</div>
          <div className="text-xs text-white/60 mt-1">Etiquetas · Guías · QR</div>
        </button>

      </div>
    </div>
  );
}
