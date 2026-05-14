'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
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
      border: 'rgba(211,47,47,0.55)', bg: 'rgba(211,47,47,0.18)', shadow: 'rgba(211,47,47,0.30)',
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
      onClick: () => { sessionStorage.setItem('despacho_from', '/despacho-hub'); router.push('/despacho'); },
    },
    {
      label: 'Estado / Seguimiento', sub: 'Etiquetas · Guías · QR',
      border: 'rgba(245,158,11,0.50)', bg: 'rgba(245,158,11,0.13)', shadow: 'rgba(245,158,11,0.18)',
      onClick: () => router.push('/despacho/estado'),
    },
    {
      label: 'Historial', sub: 'Registros de despacho',
      border: 'rgba(255,255,255,0.22)', bg: 'rgba(255,255,255,0.08)', shadow: 'rgba(255,255,255,0.10)',
      onClick: () => router.push('/historial'),
    },
    {
      label: 'Registros', sub: 'Base de datos de despachos',
      border: 'rgba(16,185,129,0.50)', bg: 'rgba(16,185,129,0.16)', shadow: 'rgba(16,185,129,0.20)',
      onClick: () => router.push('/registros'),
    },
  ];

  return (
    <div className="fixed inset-0 flex flex-col py-10 overflow-y-auto"
         style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

      {/* Back + title */}
      <div className="flex items-center gap-3 mb-10 px-6">
        <button
          onClick={() => router.push('/')}
          className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95"
          style={{
            width: 36, height: 36,
            background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}>
          <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
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
      <div className="flex md:hidden flex-col gap-3 px-6">
        {tabs.map(t => (
          <button key={t.label} onClick={t.onClick}
            className="w-full relative overflow-hidden rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2"
            style={{
              height: 88,
              background: t.bg,
              borderColor: t.border,
              boxShadow: `0 8px 24px ${t.shadow}`,
            }}>
            <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">{t.label}</div>
            <div className="text-xs text-white/60 mt-1">{t.sub}</div>
          </button>
        ))}
      </div>

    </div>
  );
}
