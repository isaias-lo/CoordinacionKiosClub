'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const ROLE_HOME: Record<string, string> = {
  auditor:          '/auditoria',
  'admin-auditoria':'/auditoria',
  despachador:      '/',
  admin:            '/',
};

const ERROR_MAP: Record<string, string> = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed':       'Confirma tu correo electrónico primero.',
  'Too many requests':         'Demasiados intentos. Espera unos minutos.',
};

function mapError(msg: string): string {
  for (const [key, val] of Object.entries(ERROR_MAP)) {
    if (msg.includes(key)) return val;
  }
  return msg;
}

const ROLE_LABEL: Record<string, string> = {
  auditor:     'Auditor',
  despachador: 'Despachador',
  admin:       'Administrador',
};

export default function LoginPage() {
  const router = useRouter();
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });

    if (authErr) {
      setError(mapError(authErr.message));
      setLoading(false);
      return;
    }

    // Role is in JWT user_metadata — no DB call needed
    const role = (data.user.user_metadata?.role as string) ?? 'auditor';
    router.push(ROLE_HOME[role] ?? '/auditoria');
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-6"
      style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}
    >
      <div className="w-full max-w-[360px]">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="font-barlow-condensed text-4xl font-bold text-white tracking-widest mb-1">
            KiosClub
          </div>
          <div className="text-[11px] text-white/40 uppercase tracking-widest">
            Sistema de despacho
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] text-white/60 uppercase tracking-wider pl-1 font-semibold">
              Correo electrónico
            </label>
            <input
              type="email"
              autoComplete="email"
              placeholder="usuario@empresa.cl"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3.5 rounded-xl border text-white placeholder:text-white/30 text-sm focus:outline-none transition-colors"
              style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)' }}
              onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.35)')}
              onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] text-white/60 uppercase tracking-wider pl-1 font-semibold">
              Contraseña
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="********"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3.5 pr-12 rounded-xl border text-white placeholder:text-white/30 text-sm focus:outline-none transition-colors"
                style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)' }}
                onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.35)')}
                onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors cursor-pointer border-none bg-transparent p-1"
                tabIndex={-1}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-400 text-center px-2 py-2 rounded-lg"
                 style={{ background: 'rgba(211,47,47,0.12)' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full py-3.5 rounded-xl font-barlow-condensed text-lg font-bold tracking-wider text-white uppercase cursor-pointer disabled:opacity-50 active:scale-95 transition-all"
            style={{
              background: loading
                ? 'rgba(37,99,235,0.5)'
                : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
              boxShadow: loading ? 'none' : '0 8px 24px rgba(37,99,235,0.4)',
            }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <div className="mt-6 flex justify-between">
          <Link href="/registro" className="text-white/60 text-[15px] font-semibold hover:text-white/90 transition-colors">Crear cuenta</Link>
          <Link href="/recuperar-contrasena" className="text-white/60 text-[15px] font-semibold hover:text-white/90 transition-colors">¿Olvidaste tu contraseña?</Link>
        </div>

        {/* Role legend */}
        <div className="mt-8 flex justify-center gap-4">
          {Object.entries(ROLE_LABEL).map(([role, label]) => (
            <div key={role} className="text-center">
              <div className="text-[10px] text-white/25 uppercase tracking-wider">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
