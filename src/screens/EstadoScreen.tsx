'use client';

import { useState } from 'react';
import { Tag, Activity, Scan, Clock } from 'lucide-react';
import { AppProvider } from '../context/AppContext';
import { EstadoPage } from '../features/despacho/estado/EstadoPage';
import { SeguimientoPanel } from '../features/despacho/estado/SeguimientoPanel';
import { ScannerPanel } from '../features/despacho/estado/ScannerPanel';
import { HistContent } from '../screens/HistScreen';
import { useAuth } from '../components/AuthProvider';

type View = 'etiquetas' | 'escaneo' | 'estado' | 'historial';

function EstadoContent() {
  const { can } = useAuth();
  const [view, setView] = useState<View>('etiquetas');

  const tabs: { id: View; label: string; Icon: typeof Tag }[] = [
    { id: 'etiquetas', label: 'Etiquetas', Icon: Tag      },
    { id: 'escaneo',   label: 'Escaneo',   Icon: Scan     },
    { id: 'estado',    label: 'Estado',    Icon: Activity  },
    { id: 'historial', label: 'Historial', Icon: Clock    },
  ];

  return (
    <div className="absolute inset-0 flex flex-col bg-bg overflow-hidden">
      {/* Header oscuro — solo título */}
      <div className="flex-shrink-0 bg-navy" style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.25)' }}>
        <div className="flex items-center px-4 py-3.5 gap-3">
          <div className="font-barlow-condensed text-[16px] font-bold text-white/90 tracking-widest uppercase flex-1">
            Estado / Seguimiento
          </div>
        </div>
      </div>

      {/* Barra de tabs clara (estilo Picking) con subrayado rojo activo */}
      <div className="flex flex-shrink-0 overflow-x-auto" style={{ background: '#fff', borderBottom: '1px solid var(--color-border)' }}>
        {tabs.map(({ id, label, Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => setView(id)}
              className="relative flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 font-barlow-condensed text-[12px] font-bold tracking-wide uppercase cursor-pointer transition-colors border-none bg-transparent whitespace-nowrap"
              style={{
                color: active ? '#1A2550' : '#64748B',
                borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
              }}>
              <Icon size={14} strokeWidth={active ? 2.2 : 1.8} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {view === 'etiquetas' && <EstadoPage />}
        {view === 'escaneo'   && <ScannerPanel />}
        {view === 'estado'    && <SeguimientoPanel canSync={can('estado/seguimiento', 'edit')} />}
        {view === 'historial' && <HistContent />}
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
