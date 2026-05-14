'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';

export default function ControlInternoPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  return (
    <div className="fixed inset-0 flex flex-col px-6 py-10 overflow-y-auto"
         style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

      {/* Back + title */}
      <div className="flex items-center gap-3 mb-10">
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

      {/* Grid de tabs */}
      <div className="grid gap-3 w-full max-w-sm mx-auto"
           style={{ gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gridAutoRows: '110px' }}>

        <button onClick={() => router.push('/tiendas')}
          className="relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[rgba(16,185,129,0.5)]"
          style={{ background: 'rgba(16,185,129,0.18)', boxShadow: '0 8px 24px rgba(16,185,129,0.22)' }}>
          <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Tiendas</div>
          <div className="text-xs text-white/60 mt-1">Recepción de despacho</div>
        </button>

        {isAdmin && (
          <button onClick={() => router.push('/auditoria')}
            className="relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[rgba(245,158,11,0.55)]"
            style={{ background: 'rgba(245,158,11,0.13)', boxShadow: '0 8px 24px rgba(245,158,11,0.20)' }}>
            <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Auditoría</div>
            <div className="text-xs text-white/60 mt-1">Control de calidad pallets</div>
          </button>
        )}

      </div>
    </div>
  );
}
