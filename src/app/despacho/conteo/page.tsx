'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, MapPin, Building2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';

export default function ConteoPage() {
  const router = useRouter();
  const { dispatch } = useApp();

  const goToNacional = () => {
    dispatch({ type: 'SET_TIENDA', payload: null });
    dispatch({ type: 'SET_TAB', payload: 0 });
    router.push('/despacho/regiones');
  };

  const options = [
    {
      id: 'nacional',
      label: 'Nacional',
      sub: 'Despacho nacional · Consolidación de bultos',
      border: 'rgba(211,47,47,0.55)',
      bg: 'rgba(211,47,47,0.18)',
      shadow: 'rgba(211,47,47,0.30)',
      onClick: goToNacional,
      Icon: MapPin,
      iconColor: 'rgba(252,165,165,0.9)',
    },
    {
      id: 'rm-costa',
      label: 'RM / Costa',
      sub: 'Despacho local RM · Consolidación de bultos',
      border: 'rgba(37,99,235,0.45)',
      bg: 'rgba(37,99,235,0.18)',
      shadow: 'rgba(37,99,235,0.25)',
      onClick: () => router.push('/despacho/santiago'),
      Icon: Building2,
      iconColor: 'rgba(147,197,253,0.9)',
    },
  ];

  return (
    <div className="fixed inset-0 flex flex-col py-10 overflow-y-auto"
         style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 mb-10 px-6">
        <div className="flex items-center gap-3 flex-1">
          <button
            onClick={() => router.push('/despacho')}
            className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
            style={{
              width: 36, height: 36,
              background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
              border: '1px solid rgba(255,255,255,0.15)',
              boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)',
            }}>
            <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
          </button>
          <div>
            <div className="font-barlow-condensed text-[11px] font-bold tracking-[0.2em] uppercase text-white/35">Despacho</div>
            <div className="font-barlow-condensed text-2xl font-bold text-white tracking-widest uppercase leading-none">Conteo / Consolidación</div>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="px-6 flex flex-col gap-4 max-w-sm mx-auto w-full">
        {options.map(o => (
          <button
            key={o.id}
            onClick={o.onClick}
            className="relative overflow-hidden rounded-2xl flex items-center gap-5 px-6 cursor-pointer transition-all active:scale-95 border-2 text-left"
            style={{
              height: 110,
              background: o.bg,
              borderColor: o.border,
              boxShadow: `0 8px 24px ${o.shadow}`,
            }}>
            <o.Icon size={32} color={o.iconColor} strokeWidth={1.5} style={{ flexShrink: 0 }} />
            <div>
              <div className="font-barlow-condensed text-2xl font-bold text-white tracking-widest uppercase leading-tight">{o.label}</div>
              <div className="text-xs text-white/55 mt-1">{o.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
