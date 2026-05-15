'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, MapPin, Building2, Route, Activity, Clock, Database } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ProfilePill } from '../../components/ProfilePill';

export default function DespachoHubPage() {
  const router = useRouter();
  const { dispatch } = useApp();

  const goToRegiones = () => {
    dispatch({ type: 'CLEAR_ALL' });
    dispatch({ type: 'SET_TIENDA', payload: null });
    dispatch({ type: 'SET_TAB', payload: 0 });
    router.push('/despacho/regiones');
  };

  const tabs: { label: string; sub: string; border: string; bg: string; shadow: string; onClick: () => void; Icon: LucideIcon; iconColor: string }[] = [
    {
      label: 'Bodega Regiones', sub: 'Despacho nacional',
      border: 'rgba(211,47,47,0.55)', bg: 'rgba(211,47,47,0.18)', shadow: 'rgba(211,47,47,0.30)',
      onClick: goToRegiones,
      Icon: MapPin, iconColor: 'rgba(252,165,165,0.9)',
    },
    {
      label: 'Bodega Santiago', sub: 'Despacho local RM',
      border: 'rgba(37,99,235,0.45)', bg: 'rgba(37,99,235,0.18)', shadow: 'rgba(37,99,235,0.25)',
      onClick: () => router.push('/despacho/santiago'),
      Icon: Building2, iconColor: 'rgba(147,197,253,0.9)',
    },
    {
      label: 'Enrutador', sub: 'Sistema de enrutamiento',
      border: 'rgba(34,197,94,0.50)', bg: 'rgba(34,197,94,0.16)', shadow: 'rgba(34,197,94,0.20)',
      onClick: () => { sessionStorage.setItem('despacho_from', '/despacho-hub'); router.push('/despacho'); },
      Icon: Route, iconColor: 'rgba(110,231,183,0.9)',
    },
    {
      label: 'Estado / Seguimiento', sub: 'Etiquetas · Guías · QR',
      border: 'rgba(245,158,11,0.50)', bg: 'rgba(245,158,11,0.13)', shadow: 'rgba(245,158,11,0.18)',
      onClick: () => router.push('/despacho/estado'),
      Icon: Activity, iconColor: 'rgba(251,191,36,0.9)',
    },
    {
      label: 'Historial', sub: 'Registros de despacho',
      border: 'rgba(255,255,255,0.22)', bg: 'rgba(255,255,255,0.08)', shadow: 'rgba(255,255,255,0.10)',
      onClick: () => router.push('/historial'),
      Icon: Clock, iconColor: 'rgba(255,255,255,0.7)',
    },
    {
      label: 'Registros', sub: 'Base de datos de despachos',
      border: 'rgba(16,185,129,0.50)', bg: 'rgba(16,185,129,0.16)', shadow: 'rgba(16,185,129,0.20)',
      onClick: () => router.push('/registros'),
      Icon: Database, iconColor: 'rgba(52,211,153,0.9)',
    },
  ];

  return (
    <>
      <style>{`
        @media (max-width: 480px) {
          .dh-root {
            padding: 0 !important;
            overflow: hidden !important;
            height: 100dvh !important;
            justify-content: flex-start !important;
          }
          .dh-header {
            justify-content: space-between !important;
            margin-bottom: 0 !important;
            padding: 12px 20px !important;
          }
          .dh-mobile-cards {
            flex: 1 !important;
            display: flex !important;
            flex-direction: column !important;
            padding: 12px 16px 20px !important;
            gap: 10px !important;
            min-height: 0;
          }
          .dh-mobile-card {
            flex: 1 !important;
            height: auto !important;
          }
        }
      `}</style>

      <div className="dh-root fixed inset-0 flex flex-col py-10 overflow-y-auto"
           style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

        {/* Header */}
        <div className="dh-header flex items-center gap-3 mb-10 px-6">
          <div className="flex items-center gap-3 flex-1">
            <button
              onClick={() => router.push('/')}
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
              <div className="font-barlow-condensed text-[11px] font-bold tracking-[0.2em] uppercase text-white/35">Módulo</div>
              <div className="font-barlow-condensed text-2xl font-bold text-white tracking-widest uppercase leading-none">Despacho</div>
            </div>
          </div>
          <ProfilePill />
        </div>

        {/* Desktop grid */}
        <div className="px-6">
          <div className="hidden md:grid md:grid-cols-2 md:gap-3 md:max-w-sm md:mx-auto" style={{ gridAutoRows: '130px' }}>
            {tabs.map(t => (
              <button key={t.label} onClick={t.onClick}
                className="relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2"
                style={{ background: t.bg, borderColor: t.border, boxShadow: `0 8px 24px ${t.shadow}` }}>
                <t.Icon size={24} color={t.iconColor} strokeWidth={1.6} style={{ marginBottom: 10 }} />
                <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">{t.label}</div>
                <div className="text-xs text-white/60 mt-1">{t.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Mobile list */}
        <div className="dh-mobile-cards flex md:hidden flex-col gap-3 px-6">
          {tabs.map(t => (
            <button key={t.label} onClick={t.onClick}
              className="dh-mobile-card w-full relative overflow-hidden rounded-2xl flex items-center gap-4 px-5 cursor-pointer transition-all active:scale-95 border-2 text-left"
              style={{
                height: 88,
                background: t.bg,
                borderColor: t.border,
                boxShadow: `0 8px 24px ${t.shadow}`,
              }}>
              <t.Icon size={22} color={t.iconColor} strokeWidth={1.6} style={{ flexShrink: 0 }} />
              <div>
                <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">{t.label}</div>
                <div className="text-xs text-white/60 mt-0.5">{t.sub}</div>
              </div>
            </button>
          ))}
        </div>

      </div>
    </>
  );
}
