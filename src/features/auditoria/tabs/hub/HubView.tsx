'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, ClipboardPlus, BarChart3, PackageOpen, Search, Clock, Settings2, Radio, TableProperties } from 'lucide-react';
import { motion } from 'framer-motion';

interface HubCard {
  Icon: React.ElementType;
  title: string;
  sub: string;
  fn: () => void;
  border: string;
  bg: string;
  shadow: string;
}

export function HubView({ userRole, onNavigate }: {
  userRole: string;
  onNavigate: (view: string) => void;
}) {
  const router = useRouter();

  const hubCards: HubCard[] = [
    { Icon: ClipboardPlus,   title: 'Agregar Audición',   sub: 'Registrar nueva auditoría de pallet',    fn: () => onNavigate('form'),               border: 'rgba(34,197,94,0.55)',  bg: 'rgba(34,197,94,0.18)',  shadow: 'rgba(34,197,94,0.22)' },
    { Icon: Radio,           title: 'En Vivo',            sub: 'Auditorías activas ahora mismo',         fn: () => onNavigate('live'),               border: 'rgba(239,68,68,0.55)',  bg: 'rgba(239,68,68,0.18)',  shadow: 'rgba(239,68,68,0.22)' },
    { Icon: TableProperties, title: 'Trazabilidad',       sub: 'Registro detallado por operación',       fn: () => onNavigate('trazabilidad'),        border: 'rgba(20,184,166,0.55)', bg: 'rgba(20,184,166,0.18)', shadow: 'rgba(20,184,166,0.20)' },
    { Icon: BarChart3,       title: 'Estadísticas',        sub: 'Dashboard del día · Ranking de Pickers', fn: () => onNavigate('stats'),              border: 'rgba(37,99,235,0.55)',  bg: 'rgba(37,99,235,0.18)',  shadow: 'rgba(37,99,235,0.22)' },
    { Icon: PackageOpen,     title: 'Producción diaria',   sub: 'Registrar pallets producidos por picker',fn: () => onNavigate('produccion'),          border: 'rgba(245,158,11,0.55)', bg: 'rgba(245,158,11,0.16)', shadow: 'rgba(245,158,11,0.20)' },
    { Icon: Search,           title: 'Revisión Auditoría',  sub: 'Lista · Fotos · Estadísticas',           fn: () => router.push('/auditoria-admin'),  border: 'rgba(124,58,237,0.55)', bg: 'rgba(124,58,237,0.18)', shadow: 'rgba(124,58,237,0.22)' },
    { Icon: Clock,           title: 'Historial',           sub: 'Tus auditorías por fecha',               fn: () => onNavigate('revision'),            border: 'rgba(217,119,6,0.55)',  bg: 'rgba(217,119,6,0.16)',  shadow: 'rgba(217,119,6,0.20)' },
    { Icon: Settings2,       title: 'Configuración',       sub: 'Pickers · Auditores · Parámetros',       fn: () => onNavigate('config'),              border: 'rgba(20,184,166,0.55)', bg: 'rgba(20,184,166,0.18)', shadow: 'rgba(20,184,166,0.20)' },
  ];

  return (
    <>
      <style>{`
        @media (max-width: 480px) {
          .aud-hub-root {
            padding: 0 !important;
            overflow: hidden !important;
            height: 100dvh !important;
          }
          .aud-hub-header {
            margin-bottom: 0 !important;
            padding: 12px 20px !important;
          }
          .aud-hub-desktop { display: none !important; }
          .aud-hub-mobile {
            display: flex !important;
            flex: 1 !important;
            flex-direction: column !important;
            padding: 12px 16px 24px !important;
            gap: 9px !important;
            min-height: 0 !important;
            overflow: hidden !important;
          }
          .aud-hub-mobile-card {
            flex: 1 !important;
            height: auto !important;
          }
        }
      `}</style>
      <div className="aud-hub-root fixed inset-0 flex flex-col py-10 overflow-y-auto"
        style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

        {/* Header */}
        <div className="aud-hub-header flex items-center justify-between gap-3 mb-10 px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(userRole === 'admin' ? '/control-interno' : '/')}
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
              <div className="font-barlow-condensed text-2xl font-bold text-white tracking-widest uppercase leading-none">Auditoría</div>
            </div>
          </div>
        </div>

        {/* Desktop grid */}
        <div className="aud-hub-desktop px-6">
          <div className="hidden md:grid md:grid-cols-2 md:gap-3 md:max-w-lg md:mx-auto">
            {hubCards.map(({ Icon, title, sub, fn, border, bg, shadow }, i) => (
              <motion.button key={title} onClick={fn}
                initial={{ opacity: 0, scale: 0.92, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: i * 0.055, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.96 }}
                className="relative overflow-hidden rounded-2xl px-5 py-5 flex flex-col items-center justify-center text-center cursor-pointer border-2"
                style={{ background: bg, borderColor: border, boxShadow: `0 8px 24px ${shadow}`, minHeight: 118 }}>
                <Icon size={28} color="rgba(255,255,255,0.85)" strokeWidth={1.5} style={{ marginBottom: 10 }} />
                <div className="font-barlow-condensed text-[18px] font-bold text-white tracking-widest uppercase leading-tight">{title}</div>
                <div className="text-[11px] text-white/55 mt-0.5">{sub}</div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Mobile cards */}
        <div className="aud-hub-mobile flex md:hidden flex-col gap-3 px-6">
          {hubCards.map(({ Icon, title, sub, fn, border, bg, shadow }, i) => (
            <motion.button key={title} onClick={fn}
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              whileTap={{ scale: 0.97 }}
              className="aud-hub-mobile-card w-full relative overflow-hidden rounded-2xl flex items-center gap-4 px-5 cursor-pointer border-2 text-left"
              style={{ background: bg, borderColor: border, boxShadow: `0 6px 20px ${shadow}`, minHeight: 66 }}>
              <Icon size={24} color="rgba(255,255,255,0.85)" strokeWidth={1.5} style={{ flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <div className="font-barlow-condensed text-[18px] font-bold text-white tracking-wide uppercase leading-tight">{title}</div>
                <div className="text-[11px] text-white/55">{sub}</div>
              </div>
              <ChevronLeft size={16} color="rgba(255,255,255,0.3)" strokeWidth={2.5} style={{ flexShrink: 0, transform: 'rotate(180deg)' }} />
            </motion.button>
          ))}
        </div>

      </div>
    </>
  );
}
