'use client';

import { useState } from 'react';
import { AppProvider } from '../context/AppContext';
import { SeguimientoPanel } from '../features/despacho/estado/SeguimientoPanel';
import { HistContent } from '../screens/HistScreen';
import { useAuth } from '../components/AuthProvider';

type View = 'estado' | 'historial';

function EstadoContent() {
  const { can } = useAuth();
  const [view, setView] = useState<View>('estado');

  // Tabs "Etiquetas" (Zebra) y "Escaneo" removidos: las etiquetas salen de Picking y las
  // guías se suben en Bodega → esas vistas no se usaban aquí. Quedan Estado e Historial.
  const tabs: { id: View; label: string }[] = [
    { id: 'estado',    label: 'Estado'    },
    { id: 'historial', label: 'Historial' },
  ];

  const tabBar = (
    <div className="flex flex-shrink-0 overflow-x-auto" style={{ background: '#fff', borderBottom: '1px solid var(--color-border)' }}>
      {tabs.map(({ id, label }) => {
        const active = view === id;
        return (
          <button
            key={id}
            onClick={() => setView(id)}
            className="relative flex-1 py-2.5 text-[11px] font-medium cursor-pointer transition-colors border-none bg-transparent whitespace-nowrap px-3"
            style={{
              color: active ? '#1A2550' : '#64748B',
              borderBottom: active ? '2px solid var(--color-info)' : '2px solid transparent',
            }}>
            {label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="absolute inset-0 flex flex-col bg-bg overflow-hidden">
      {/* ── Header oscuro a lo ancho total (mismo color que Picking) ── */}
      <div
        className="mobile-menu-safe flex-shrink-0 flex items-center px-4 py-3 gap-3"
        style={{ background: 'var(--sidebar-bg)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="font-barlow-condensed text-[20px] font-bold text-white leading-tight tracking-wide flex-1">
          Estado / Seguimiento
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {tabBar}
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
