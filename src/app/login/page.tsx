'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const ROLE_HOME: Record<string, string> = {
  auditor:     '/auditoria',
  despachador: '/',
  admin:       '/',
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
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

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
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-white/45 uppercase tracking-wider pl-1">
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

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-white/45 uppercase tracking-wider pl-1">
              Contraseña
            </label>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3.5 rounded-xl border text-white placeholder:text-white/30 text-sm focus:outline-none transition-colors"
              style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)' }}
              onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.35)')}
              onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
            />
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
