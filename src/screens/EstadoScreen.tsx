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
      <div className="flex-shrink-0 bg-navy" style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.25)' }}>
        <div className="flex items-center px-4 pt-3 pb-3 gap-3">
          <div className="font-barlow-condensed text-[16px] font-bold text-white/90 tracking-widest uppercase flex-1">
            Estado / Seguimiento
          </div>

          {/* Tabs sobrias con acento rojo abajo — mismo lenguaje que el sidebar */}
          <div className="flex gap-0.5">
            {tabs.map(({ id, label, Icon }) => {
              const active = view === id;
              return (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className="relative flex items-center gap-1.5 px-3.5 py-2.5 font-barlow-condensed text-[13px] font-bold tracking-wide uppercase cursor-pointer transition-colors"
                  style={{ color: active ? '#fff' : 'rgba(255,255,255,0.45)' }}>
                  <Icon size={14} strokeWidth={active ? 2.2 : 1.9} />
                  <span className="hidden sm:inline">{label}</span>
                  {active && <span className="absolute left-2.5 right-2.5 bottom-0 h-[2.5px] rounded-full bg-kred" />}
                </button>
              );
            })}
          </div>

        </div>
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
