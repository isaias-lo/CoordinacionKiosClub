'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Custom fallback UI */
  fallback?: React.ReactNode;
  /** Module label shown in error message */
  module?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.module ? `:${this.props.module}` : ''}]`, error, info);
  }

  handleReset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] p-8 text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'rgba(212,43,43,0.10)' }}
        >
          <AlertTriangle size={26} className="text-kred" strokeWidth={1.5} />
        </div>

        <h3 className="font-barlow-condensed font-bold uppercase tracking-wide text-[17px] text-text mb-1">
          Algo salió mal
          {this.props.module && <span className="text-text-3"> en {this.props.module}</span>}
        </h3>

        <p className="text-text-3 text-[13px] max-w-[300px] leading-relaxed mb-5">
          {this.state.error?.message ?? 'Error desconocido. Intenta recargar o volver al inicio.'}
        </p>

        <div className="flex gap-2">
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2.5 rounded-btn text-[13px] font-semibold text-white transition-all"
            style={{ background: '#1B2A6B' }}
          >
            <RefreshCw size={14} strokeWidth={2} />
            Reintentar
          </button>
          <a
            href="/"
            className="flex items-center gap-2 px-4 py-2.5 rounded-btn text-[13px] font-semibold text-text-2 bg-bg border border-border hover:bg-border/60 transition-colors"
          >
            <Home size={14} strokeWidth={2} />
            Inicio
          </a>
        </div>
      </div>
    );
  }
}

/** Functional convenience wrapper */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  module?: string,
) {
  return function WrappedComponent(props: P) {
    return (
      <ErrorBoundary module={module}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
