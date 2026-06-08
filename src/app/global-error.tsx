'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#F2F2F7' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100dvh', padding: 32, textAlign: 'center',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, background: 'rgba(212,43,43,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
          }}>
            <AlertTriangle size={26} color="#D42B2B" strokeWidth={1.5} />
          </div>

          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1C1C1E', margin: '0 0 8px' }}>
            Error crítico de aplicación
          </h1>
          <p style={{ fontSize: 13, color: '#8E8E93', maxWidth: 320, lineHeight: 1.5, margin: '0 0 24px' }}>
            {error.message || 'Ocurrió un error inesperado. El equipo fue notificado automáticamente.'}
          </p>

          <button
            onClick={reset}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: '#1B2A6B', color: '#fff', fontSize: 13,
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} strokeWidth={2} />
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
