'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { AppProvider } from '../context/AppContext';
import { ProfilePill } from '../components/ProfilePill';
import { EstadoPage } from '../features/despacho/estado/EstadoPage';
import { SeguimientoPanel } from '../features/despacho/estado/SeguimientoPanel';

type View = 'etiquetas' | 'estado';

function EstadoContent() {
  const router = useRouter();
  const [view, setView] = useState<View>('etiquetas');

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      <div
        className="flex-shrink-0 bg-navy"
        style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.25)' }}>

        <div className="flex items-center px-4 pt-3 pb-3 gap-3">
          <button
            onClick={() => router.push('/despacho-hub')}
            className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
            style={{
              width: 36, height: 36,
              background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
              border: '1px solid rgba(255,255,255,0.15)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}>
            <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
          </button>

          <div className="font-barlow-condensed text-[16px] font-bold text-white/90 tracking-widest uppercase flex-1">
            Estado / Seguimiento
          </div>

          {/* Toggle ETIQUETAS / ESTADO */}
          <div className="flex rounded-full overflow-hidden border border-white/20">
            <button
              onClick={() => setView('etiquetas')}
              className="flex-1 px-5 py-2.5 font-barlow-condensed text-[15px] font-bold tracking-widest uppercase cursor-pointer transition-all"
              style={view === 'etiquetas'
                ? { background: 'rgba(255,255,255,0.22)', color: '#fff' }
                : { background: 'transparent', color: 'rgba(255,255,255,0.45)' }}>
              Etiquetas
            </button>
            <button
              onClick={() => setView('estado')}
              className="flex-1 px-5 py-2.5 font-barlow-condensed text-[15px] font-bold tracking-widest uppercase cursor-pointer transition-all"
              style={view === 'estado'
                ? { background: 'rgba(255,255,255,0.22)', color: '#fff' }
                : { background: 'transparent', color: 'rgba(255,255,255,0.45)' }}>
              Estado
            </button>
          </div>

          <ProfilePill compact />
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {view === 'etiquetas' ? <EstadoPage /> : <SeguimientoPanel />}
      </div>
    </div>
  );
}

export function EstadoScreen() {
  return (
    <AppProvider>
      <EstadoContent />
    </AppProvider>
  );
}
