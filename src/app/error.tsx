'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * Route-level error boundary. Next.js wraps every page below the root layout
 * with this component automatically, so a render error in any page shows this
 * fallback instead of a white screen — while keeping the root layout mounted.
 * Errors in the root layout itself are caught by `global-error.tsx`.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[RouteError]', error);
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] h-full p-8 text-center">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'rgba(212,43,43,0.10)' }}
      >
        <AlertTriangle size={26} className="text-kred" strokeWidth={1.5} />
      </div>

      <h2 className="font-barlow-condensed font-bold uppercase tracking-wide text-[17px] text-text mb-1">
        Algo salió mal
      </h2>

      <p className="text-text-3 text-[13px] max-w-[320px] leading-relaxed mb-5">
        {error.message || 'Ocurrió un error inesperado. Intenta recargar o volver al inicio.'}
      </p>

      <div className="flex gap-2">
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2.5 rounded-btn text-[13px] font-semibold text-white transition-all"
          style={{ background: '#1B2A6B' }}
        >
          <RefreshCw size={14} strokeWidth={2} />
          Reintentar
        </button>
        <Link
          href="/"
          className="flex items-center gap-2 px-4 py-2.5 rounded-btn text-[13px] font-semibold text-text-2 bg-bg border border-border hover:bg-border/60 transition-colors"
        >
          <Home size={14} strokeWidth={2} />
          Inicio
        </Link>
      </div>
    </div>
  );
}
