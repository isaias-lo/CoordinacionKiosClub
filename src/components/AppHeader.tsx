'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Check, Sun, Moon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { REGIONES_TERMINADO_KEY } from './modals/FinishModal';

interface AppHeaderProps {
  onFinish: () => void;
  backTo?: string;
}

export function AppHeader({ onFinish, backTo = '/despacho' }: AppHeaderProps) {
  const { state, flushPending } = useApp();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const router = useRouter();
  const [terminated, setTerminated] = useState(false);
  const [terminatedAt, setTerminatedAt] = useState('');

  useEffect(() => {
    const val = localStorage.getItem(REGIONES_TERMINADO_KEY);
    if (val) { setTerminated(true); setTerminatedAt(val); }
  }, []);

  const confirmBack = (dest: string) => {
    flushPending();
    router.push(dest);
  };

  const handleReopen = () => {
    if (!confirm('¿Reabrir el despacho del día?')) return;
    localStorage.removeItem(REGIONES_TERMINADO_KEY);
    setTerminated(false);
    setTerminatedAt('');
  };

  return (
    <div className="flex items-center px-4 py-3 gap-3 flex-shrink-0"
         style={{ background: 'var(--surface-header)', borderBottom: '1px solid var(--line)' }}>

      {/* Back — flat square, no shadow */}
      <button
        onClick={() => confirmBack(backTo)}
        className="flex items-center justify-center cursor-pointer transition-all active:opacity-70 flex-shrink-0"
        style={{
          width: 34, height: 34,
          background: 'var(--surface-raised)',
          border: '1px solid var(--line-2)',
          borderRadius: 6,
        }}>
        <ChevronLeft size={16} style={{ color: 'var(--text-mid)' }} strokeWidth={1.5} />
      </button>

      {/* Center: label + date */}
      <div className="flex flex-col items-center flex-1 min-w-0">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] leading-none"
              style={{ color: 'var(--text-lo)' }}>
          NACIONAL
        </span>
        {state.dispatchDate && (
          <span className="font-mono text-[13px] font-bold leading-none mt-[5px]"
                style={{ color: 'var(--text-hi)' }}>
            {state.dispatchDate}
          </span>
        )}
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        className="flex items-center justify-center cursor-pointer transition-all active:opacity-70 flex-shrink-0"
        style={{
          width: 34, height: 34,
          background: 'var(--surface-raised)',
          border: '1px solid var(--line-2)',
          borderRadius: 6,
        }}>
        {isDark
          ? <Sun  size={15} color="rgba(255,255,255,0.45)" strokeWidth={1.5} />
          : <Moon size={15} color="rgba(0,0,0,0.45)"       strokeWidth={1.5} />}
      </button>

      {/* Registrar / Completado — flat, no gradient */}
      {terminated ? (
        <button
          onClick={handleReopen}
          title={`Terminado a las ${terminatedAt} · Toca para reabrir`}
          className="flex items-center gap-1.5 px-3 py-2 cursor-pointer transition-all active:opacity-70 flex-shrink-0"
          style={{
            background: 'rgba(22,163,74,0.10)',
            border: '1px solid rgba(22,163,74,0.25)',
            borderRadius: 6,
          }}>
          <Check size={13} color="#4ADE80" strokeWidth={2.5} />
          <div className="flex flex-col leading-none">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-widest"
                  style={{ color: '#4ADE80' }}>Completado</span>
            {terminatedAt && (
              <span className="font-mono text-[9px] mt-0.5"
                    style={{ color: 'var(--text-lo)' }}>{terminatedAt}</span>
            )}
          </div>
        </button>
      ) : (
        <button
          onClick={onFinish}
          className="px-4 py-2 cursor-pointer transition-all active:opacity-75 flex-shrink-0 font-mono text-[11px] font-semibold uppercase tracking-widest text-white"
          style={{ background: '#D42B2B', borderRadius: 6 }}>
          Registrar
        </button>
      )}
    </div>
  );
}
