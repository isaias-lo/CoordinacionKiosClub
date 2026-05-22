'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Calendar } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { refreshCalendario } from '@/features/despacho/utils/useCalendario';
import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';
import CalendarioCentral from '@/features/control-interno/CalendarioCentral';

type CalRecord = Record<string, { rm: string[]; costa: string[]; fal: string[] }>;

export default function CalendarioAdminPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [cal, setCal]             = useState<CalRecord | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  useEffect(() => {
    refreshCalendario()
      .then(c => { setCal(c); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async (newCal: CalRecord) => {
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/calendario-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendario: newCal }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al guardar');
      }
      // Bust cache so all modules get fresh data
      await refreshCalendario();
      setCal(newCal);
      setSaveStatus('success');
      setLastSaved(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
      setTimeout(() => setSaveStatus('idle'), 3500);
    } catch (err) {
      console.error('[calendario-write]', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    }
  }, []);

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
    <div className="fixed inset-0 bg-kbg overflow-y-auto">

      {/* ── Header ── */}
      <div className="bg-kred px-5 pt-5 pb-5 sticky top-0 z-10 shadow-[0_2px_12px_rgba(0,0,0,0.15)]">
        <div className="max-w-[780px] mx-auto flex items-start justify-between">
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
            {lastSaved && (
              <span className="text-[11px] text-white/50 font-mono">Guardado {lastSaved}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="w-8 h-8 border-2 border-kred border-t-transparent rounded-full animate-spin" />
          <div className="text-kmuted text-[14px]">Cargando calendario desde Sheets...</div>
        </div>
      ) : cal ? (
        <CalendarioCentral
          cal={cal}
          tiendas={TIENDAS_INICIAL}
          saveStatus={saveStatus}
          onSave={handleSave}
        />
      ) : (
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-6">
          <div className="text-[32px]">⚠️</div>
          <div className="text-[16px] font-bold text-ktext">No se pudo cargar el calendario</div>
          <div className="text-[13px] text-kmuted">Revisa la conexión con Google Sheets</div>
          <button onClick={() => { setLoading(true); refreshCalendario().then(c => { setCal(c); setLoading(false); }); }}
            className="mt-2 h-[40px] px-6 rounded-[10px] bg-kred text-white text-[14px] font-bold">
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
