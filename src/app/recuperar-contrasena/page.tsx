'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function RecuperarContrasenaPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/actualizar-contrasena`,
    });

    if (resetErr) {
      setError(resetErr.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-6"
      style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}
    >
      <div className="w-full max-w-[360px]">

        <div className="text-center mb-8">
          <div className="font-barlow-condensed text-4xl font-bold text-white tracking-widest mb-1">
            KiosClub
          </div>
          <div className="text-[11px] text-white/40 uppercase tracking-widest">
            Recuperar contraseña
          </div>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="text-5xl mb-4">📧</div>
            <div className="font-barlow-condensed text-2xl font-bold text-white mb-3">
              Revisa tu correo
            </div>
            <p className="text-white/50 text-sm mb-8">
              Si existe una cuenta con <strong className="text-white/70">{email}</strong>, recibirás un enlace para restablecer tu contraseña.
            </p>
            <Link
              href="/login"
              className="inline-block w-full py-3.5 rounded-xl font-barlow-condensed text-lg font-bold tracking-wider text-white uppercase text-center"
              style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', boxShadow: '0 8px 24px rgba(37,99,235,0.4)' }}
            >
              Volver al login
            </Link>
          </div>
        ) : (
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
              {loading ? 'Enviando...' : 'Enviar enlace'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link href="/login" className="text-white/40 text-sm">
            Volver al login
          </Link>
        </div>
      </div>
    </div>
  );
}