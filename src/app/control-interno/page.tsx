'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
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
    {
      label: 'Revisión Auditoría', sub: 'Revisión y seguimiento',
      border: 'rgba(124,58,237,0.5)', bg: 'rgba(124,58,237,0.15)', shadow: 'rgba(124,58,237,0.22)',
      onClick: () => router.push('/auditoria-admin'),
      adminOnly: true,
    },
    {
      label: 'Config. Tiendas', sub: 'Administración de tiendas',
      border: 'rgba(211,47,47,0.55)', bg: 'rgba(211,47,47,0.18)', shadow: 'rgba(211,47,47,0.28)',
      onClick: () => router.push('/admin/tiendas'),
      adminOnly: true,
    },
  ].filter(t => !t.adminOnly || isAdmin);

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
          <div className="font-barlow-condensed text-2xl font-bold text-white tracking-widest uppercase leading-none">Control Interno</div>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block px-6">
        <div className="grid gap-3 max-w-sm mx-auto"
             style={{ gridTemplateColumns: tabs.length === 1 ? '1fr' : '1fr 1fr', gridAutoRows: '110px' }}>
          {tabs.map(t => (
            <button key={t.sub} onClick={t.onClick}
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
          <button key={t.sub} onClick={t.onClick}
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
