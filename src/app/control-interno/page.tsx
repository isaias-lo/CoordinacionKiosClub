'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, ClipboardCheck, Search, Settings, PackageCheck, CheckSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../components/AuthProvider';
import { ProfilePill } from '../../components/ProfilePill';

export default function ControlInternoPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const tabs: { label: string; sub: string; border: string; bg: string; shadow: string; onClick: () => void; adminOnly: boolean; Icon: LucideIcon; iconColor: string }[] = [
    {
      label: 'Auditoría', sub: 'Control de calidad pallets',
      border: 'rgba(245,158,11,0.55)', bg: 'rgba(245,158,11,0.13)', shadow: 'rgba(245,158,11,0.20)',
      onClick: () => router.push('/auditoria'), adminOnly: true,
      Icon: ClipboardCheck, iconColor: 'rgba(251,191,36,0.9)',
    },
    {
      label: 'Revisión Auditoría', sub: 'Revisión y seguimiento',
      border: 'rgba(124,58,237,0.5)', bg: 'rgba(124,58,237,0.15)', shadow: 'rgba(124,58,237,0.22)',
      onClick: () => router.push('/auditoria-admin'), adminOnly: true,
      Icon: Search, iconColor: 'rgba(167,139,250,0.9)',
    },
    {
      label: 'Config. Tiendas', sub: 'Gestión de tiendas · Calendario central',
      border: 'rgba(211,47,47,0.55)', bg: 'rgba(211,47,47,0.18)', shadow: 'rgba(211,47,47,0.28)',
      onClick: () => router.push('/admin/tiendas'), adminOnly: true,
      Icon: Settings, iconColor: 'rgba(252,165,165,0.9)',
    },
    {
      label: 'Recepción/Tienda', sub: 'Registro de entrega en tienda',
      border: 'rgba(16,185,129,0.55)', bg: 'rgba(16,185,129,0.13)', shadow: 'rgba(16,185,129,0.20)',
      onClick: () => router.push('/recepcion-tienda'), adminOnly: false,
      Icon: PackageCheck, iconColor: 'rgba(52,211,153,0.9)',
    },
    {
      label: 'Validación Tienda', sub: 'Confirmar entregas recibidas',
      border: 'rgba(99,102,241,0.55)', bg: 'rgba(99,102,241,0.13)', shadow: 'rgba(99,102,241,0.20)',
      onClick: () => router.push('/validacion-tienda'), adminOnly: false,
      Icon: CheckSquare, iconColor: 'rgba(129,140,248,0.9)',
    },
  ].filter(t => !t.adminOnly || isAdmin);

  return (
    <>
      <style>{`
        @media (max-width: 480px) {
          .ci-root {
            padding: 0 !important;
            overflow: hidden !important;
            height: 100dvh !important;
            justify-content: flex-start !important;
          }
          .ci-header {
            justify-content: space-between !important;
            margin-bottom: 0 !important;
            padding: 12px 20px !important;
          }
          .ci-avatar-hdr { display: block !important; }
          .ci-mobile-cards {
            flex: 1 !important;
            display: flex !important;
            flex-direction: column !important;
            padding: 12px 16px 20px !important;
            gap: 10px !important;
            min-height: 0;
          }
          .ci-mobile-card {
            flex: 1 !important;
            height: auto !important;
          }
        }
      `}</style>

      <div className="ci-root fixed inset-0 flex flex-col py-10 overflow-y-auto"
           style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

        {/* Header */}
        <div className="ci-header flex items-center gap-3 mb-10 px-6">
          {/* Left: back + title */}
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
              <div className="font-barlow-condensed text-2xl font-bold text-white tracking-widest uppercase leading-none">Control Interno</div>
            </div>
          </div>

          {/* Right: profile pill */}
          <ProfilePill />
        </div>

        {/* Desktop grid */}
        <div className="hidden md:block px-6">
          <div className="grid gap-3 max-w-sm mx-auto"
               style={{ gridTemplateColumns: tabs.length === 1 ? '1fr' : '1fr 1fr', gridAutoRows: '130px' }}>
            {tabs.map(t => (
              <button key={t.sub} onClick={t.onClick}
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
        <div className="ci-mobile-cards flex md:hidden flex-col gap-3 px-6">
          {tabs.map(t => (
            <button key={t.sub} onClick={t.onClick}
              className="ci-mobile-card w-full relative overflow-hidden rounded-2xl flex items-center gap-4 px-5 cursor-pointer transition-all active:scale-95 border-2 text-left"
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
