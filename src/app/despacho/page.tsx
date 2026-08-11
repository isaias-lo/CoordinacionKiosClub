'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SantiagoProvider } from '../../features/despacho/santiago/context/SantiagoContext';
import { useAuth } from '@/components/AuthProvider';

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
  const router  = useRouter();
  const { profile } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined') {
      const from = sessionStorage.getItem('despacho_from');
      if (from) {
        sessionStorage.removeItem('despacho_from');
        if (from === '/despacho/santiago') {
          sessionStorage.setItem('santiago_resume_form', '1');
        }
        router.push(from);
        return;
      }
    }
    // Navegar al hub si el usuario tiene acceso, de lo contrario al inicio de sesión
    const paths = profile?.allowedPaths ?? [];
    const dest = paths.includes('*') || paths.includes('/despacho')
      ? '/despacho'
      : '/';
    router.push(dest);
  }, [router, profile]);

  if (!mounted) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg overflow-hidden">
        <div className="text-text-3">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="despacho-root fixed inset-0 flex flex-col bg-bg overflow-hidden">
      <div className="despacho-content flex-1 overflow-hidden">
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