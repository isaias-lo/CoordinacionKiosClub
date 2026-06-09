'use client';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Calendar } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import CalendarioColumnas from '@/features/control-interno/CalendarioColumnas';

export default function CalendarioAdminPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-kbg">
        <div className="text-center px-6">
          <div className="text-[32px] mb-3">🔒</div>
          <div className="text-[16px] font-bold text-ktext mb-1">Acceso restringido</div>
          <div className="text-[13px] text-kmuted">Solo administradores pueden acceder al Calendario Central</div>
          <button onClick={() => router.back()} className="mt-4 h-[40px] px-6 rounded-[10px] bg-kred text-white text-[14px] font-bold">Volver</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#F2F2F7', overflowY: 'auto' }}>

      {/* ── Header ── */}
      <div className="bg-kred px-5 pt-5 pb-5 sticky top-0 z-10 shadow-[0_2px_12px_rgba(0,0,0,0.15)]">
        <div className="flex items-start justify-between" style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()}
              className="w-[34px] h-[34px] rounded-[9px] bg-white/[0.18] text-white flex items-center justify-center hover:bg-white/[0.28] transition-all flex-shrink-0">
              <ChevronLeft size={18} color="white" strokeWidth={2} />
            </button>
            <div>
              <div className="text-[11px] font-semibold text-white/60 uppercase tracking-[1.2px] mb-0.5">Control Interno</div>
              <div className="text-[22px] font-extrabold text-white leading-tight">Calendario Central</div>
              <div className="text-[13px] text-white/70 mt-0.5">
                Arrastra tiendas entre días · ✕ para quitar · cambios afectan a todos los módulos
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <Calendar size={22} color="rgba(255,255,255,0.5)" />
          </div>
        </div>
      </div>

      {/* ── Body: CalendarioColumnas con source='despacho' → afecta a calendario_central ── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '12px 12px 24px' }}>
        <CalendarioColumnas source="despacho" />
      </div>
    </div>
  );
}
