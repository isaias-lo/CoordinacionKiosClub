'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';

export default function ControlInternoPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const tabs = [
    {
      label: 'Tiendas', sub: 'Recepción de despacho',
      border: 'rgba(16,185,129,0.5)', bg: 'rgba(16,185,129,0.18)', shadow: 'rgba(16,185,129,0.22)',
      onClick: () => router.push('/tiendas'),
      adminOnly: false,
    },
    {
      label: 'Auditoría', sub: 'Control de calidad pallets',
      border: 'rgba(245,158,11,0.55)', bg: 'rgba(245,158,11,0.13)', shadow: 'rgba(245,158,11,0.20)',
      onClick: () => router.push('/auditoria'),
      adminOnly: true,
    },
  ].filter(t => !t.adminOnly || isAdmin);

  const mobileCardWidth = tabs.length === 1
    ? 'calc(100vw - 48px)'
    : 'calc((100vw - 60px) / 2)';

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
          <div className="font-barlow-condensed text-2xl font-bold text-white tracking-widest uppercase leading-none">Control Interno</div>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block px-6">
        <div className="grid gap-3 max-w-sm mx-auto"
             style={{ gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gridAutoRows: '110px' }}>
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
              width: mobileCardWidth,
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
