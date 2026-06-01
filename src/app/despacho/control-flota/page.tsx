'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { ProfilePill } from '@/components/ProfilePill';
import { ControlFlotaPanel } from '@/features/despacho/control-flota/ControlFlotaPanel';

export default function ControlFlotaPage() {
  const router = useRouter();

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 bg-navy" style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.25)' }}>
        <div className="flex items-center px-4 pt-3 pb-3 gap-3">
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
            <div className="font-barlow-condensed text-[10px] font-bold tracking-[0.2em] uppercase text-white/35">Módulo</div>
            <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-none">Control de Flota</div>
          </div>
          <ProfilePill />
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <ControlFlotaPanel />
      </div>
    </div>
  );
}
