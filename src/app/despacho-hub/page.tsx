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

  const tabs = [
    {
      label: 'Bodega Regiones', sub: 'Despacho nacional',
      border: '#B71C1C', bg: '#D32F2F', shadow: 'rgba(211,47,47,0.40)',
      onClick: goToRegiones,
    },
    {
      label: 'Bodega Santiago', sub: 'Despacho local RM',
      border: 'rgba(37,99,235,0.45)', bg: 'rgba(37,99,235,0.18)', shadow: 'rgba(37,99,235,0.25)',
      onClick: () => router.push('/despacho/santiago'),
    },
    {
      label: 'Enrutador', sub: 'Sistema de enrutamiento',
      border: 'rgba(34,197,94,0.50)', bg: 'rgba(34,197,94,0.16)', shadow: 'rgba(34,197,94,0.20)',
      onClick: () => router.push('/despacho'),
    },
    {
      label: 'Estado / Seguimiento', sub: 'Etiquetas · Guías · QR',
      border: 'rgba(245,158,11,0.50)', bg: 'rgba(245,158,11,0.13)', shadow: 'rgba(245,158,11,0.18)',
      onClick: () => router.push('/despacho/estado'),
    },
  ];

  return (
    <div className="fixed inset-0 flex flex-col py-10 overflow-y-auto"
         style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

      {/* Back + title */}
      <div className="flex items-center gap-3 mb-10 px-6">
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

      {/* Móvil: fila horizontal scrollable · Desktop: grid 2 cols */}
      <div className="px-6">
        {/* Desktop */}
        <div className="hidden md:grid md:grid-cols-2 md:gap-3 md:max-w-sm md:mx-auto" style={{ gridAutoRows: '110px' }}>
          {tabs.map(t => (
            <button key={t.label} onClick={t.onClick}
              className="relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2"
              style={{ background: t.bg, borderColor: t.border, boxShadow: `0 8px 24px ${t.shadow}` }}>
              <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">{t.label}</div>
              <div className="text-xs text-white/60 mt-1">{t.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Móvil */}
      <div className="flex md:hidden gap-3 overflow-x-auto no-scrollbar px-6">
        {tabs.map(t => (
          <button key={t.label} onClick={t.onClick}
            className="flex-shrink-0 relative overflow-hidden rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2"
            style={{
              width: 'calc((100vw - 60px) / 2)',
              height: 110,
              background: t.bg,
              borderColor: t.border,
              boxShadow: `0 8px 24px ${t.shadow}`,
            }}>
            <div className="font-barlow-condensed text-lg font-bold text-white tracking-widest uppercase leading-tight px-2">{t.label}</div>
            <div className="text-[11px] text-white/60 mt-1">{t.sub}</div>
          </button>
        ))}
        <div className="flex-shrink-0 w-2" />
      </div>

    </div>
  );
}
