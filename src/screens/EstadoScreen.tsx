'use client';

import { useState } from 'react';
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

  const tabs: { id: View; label: string }[] = [
    { id: 'etiquetas', label: 'Etiquetas' },
    { id: 'escaneo',   label: 'Escaneo'   },
    { id: 'estado',    label: 'Estado'    },
    { id: 'historial', label: 'Historial' },
  ];

  // Barra de tabs (idéntica a Picking). En Etiquetas se inyecta como primer
  // hijo del panel derecho (pegada a la columna, sin hueco); en las demás
  // vistas (full-width) se renderiza arriba desde aquí.
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
        {/* Etiquetas: layout columna + panel derecho → los tabs van pegados a
            la columna (se inyectan dentro de la vista). */}
        {view === 'etiquetas' && <EstadoPage tabBar={tabBar} />}

        {/* Demás vistas: full-width → tabs arriba a lo ancho. */}
        {view !== 'etiquetas' && tabBar}
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
