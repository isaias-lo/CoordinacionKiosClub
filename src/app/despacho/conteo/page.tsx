'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, ClipboardList } from 'lucide-react';
import { ProfilePill } from '../../../components/ProfilePill';

export default function ConteoPage() {
  const router = useRouter();

  return (
    <div className="fixed inset-0 flex flex-col"
         style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button
          onClick={() => router.push('/despacho-hub')}
          className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
          style={{
            width: 36, height: 36,
            background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)',
          }}>
          <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
        </button>
        <div className="flex-1">
          <div className="font-barlow-condensed text-[11px] font-bold tracking-[0.2em] uppercase text-white/35">Despacho</div>
          <div className="font-barlow-condensed text-2xl font-bold text-white tracking-widest uppercase leading-none">
            Conteo / Consolidación
          </div>
        </div>
        <ProfilePill />
      </div>

      {/* Content placeholder */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
        <div className="flex items-center justify-center rounded-2xl"
             style={{
               width: 72, height: 72,
               background: 'rgba(6,182,212,0.15)',
               border: '1px solid rgba(6,182,212,0.35)',
             }}>
          <ClipboardList size={32} color="rgba(103,232,249,0.9)" strokeWidth={1.6} />
        </div>
        <div className="text-center">
          <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase">
            Conteo / Consolidación
          </div>
          <div className="text-sm text-white/50 mt-1">Módulo en construcción</div>
        </div>
      </div>

    </div>
  );
}
