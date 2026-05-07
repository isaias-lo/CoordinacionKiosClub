'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SantiagoProvider } from '../../features/despacho/santiago/context/SantiagoContext';

function RutasScreenWrapper({ onBack }: { onBack: () => void }) {
  const [RutasScreen, setRutasScreen] = useState<React.ComponentType<{ onBack?: () => void }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    import('../../features/despacho/rutas/RutasScreen')
      .then(module => {
        setRutasScreen(() => module.default);
      })
      .catch(err => {
        console.error('Error loading RutasScreen:', err);
        setError('Error al cargar el sistema de enrutamiento');
      });
  }, []);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <div className="text-text-2 font-bold mb-2">Error</div>
          <div className="text-text-3 text-sm">{error}</div>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-navy text-white rounded-lg text-sm"
          >
            Recargar página
          </button>
        </div>
      </div>
    );
  }

  if (!RutasScreen) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-text-3">Cargando sistema de enrutamiento...</div>
      </div>
    );
  }

  return <RutasScreen onBack={onBack} />;
}

function SyncManager() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;

    const syncFromSantiago = () => {
      try {
        const raw = localStorage.getItem('rutasInput');
        if (raw) {
          const items = JSON.parse(raw);
          if (items.length > 0) {
            localStorage.removeItem('rutasInput');
          }
        }
      } catch {}
    };

    syncFromSantiago();
    const interval = setInterval(syncFromSantiago, 2000);

    return () => clearInterval(interval);
  }, [mounted]);

  return null;
}

function DespachoContent() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleBack = useCallback(() => {
    router.push('/despacho/santiago');
  }, [router]);

  if (!mounted) {
    return (
      <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
        <div className="bg-navy px-4 py-3 flex items-center gap-2 flex-shrink-0">
          <img src="/logo.png" className="h-7 brightness-0 invert" alt="KiosClub" />
          <div className="font-barlow-condensed text-[13px] text-white/60 tracking-wide flex-1 text-center">
            🗺️ Sistema de Despacho
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-text-3">Cargando...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 bg-navy gap-2 flex-shrink-0"
        style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.25)' }}>
        <img src="/logo.png" className="h-7 brightness-0 invert" alt="KiosClub" 
             onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <div className="font-barlow-condensed text-[13px] text-white/60 tracking-wide flex-1 text-center">
          🗺️ Sistema de Despacho
        </div>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 bg-white/12 text-white border border-white/20 rounded-full font-barlow-condensed text-[15px] font-bold tracking-widest uppercase cursor-pointer whitespace-nowrap transition-all active:bg-white/20">
          INICIO
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <RutasScreenWrapper onBack={handleBack} />
      </div>
    </div>
  );
}

export default function DespachoPage() {
  return (
    <SantiagoProvider>
      <SyncManager />
      <DespachoContent />
    </SantiagoProvider>
  );
}