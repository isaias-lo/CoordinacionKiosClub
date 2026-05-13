'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function RegistroPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName, email }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Error al registrar');
      setLoading(false);
      return;
    }

    sessionStorage.setItem('pendingEmail', email);
    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center px-6"
        style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}
      >
        <div className="w-full max-w-[360px] text-center">
          <div className="text-6xl mb-6">✅</div>
          <div className="font-barlow-condensed text-3xl font-bold text-white mb-3">
            ¡Registro exitoso!
          </div>
          <p className="text-white/50 text-sm mb-3">
            Tu cuenta fue creada con el correo<br />
            <strong className="text-white/70">{email}</strong>.
          </p>
          <p className="text-white/40 text-sm mb-8">
            Un administrador revisará tu solicitud y te asignará un rol de acceso.
            Recibirás un correo cuando tu cuenta sea aprobada.
          </p>
          <div className="rounded-xl p-4 mb-8 text-left" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="text-[11px] text-white/30 uppercase tracking-wider mb-2">¿Qué sigue?</div>
            <div className="text-sm text-white/60 space-y-2">
              <div className="flex gap-2"><span className="text-blue-400">1.</span> El admin revisa tu registro</div>
              <div className="flex gap-2"><span className="text-blue-400">2.</span> Te llega un correo con tus credenciales</div>
              <div className="flex gap-2"><span className="text-blue-400">3.</span> Ingresa con tu usuario y contraseña nueva</div>
            </div>
          </div>
          <Link
            href="/login"
            className="inline-block w-full py-3.5 rounded-xl font-barlow-condensed text-lg font-bold tracking-wider text-white uppercase text-center"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', boxShadow: '0 8px 24px rgba(37,99,235,0.4)' }}
          >
            Ir al login
          </Link>
        </div>
      </div>
    );
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
            Crear cuenta
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-white/45 uppercase tracking-wider pl-1">
              Nombre completo
            </label>
            <input
              type="text"
              autoComplete="name"
              placeholder="Juan Pérez"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              required
              className="w-full px-4 py-3.5 rounded-xl border text-white placeholder:text-white/30 text-sm focus:outline-none transition-colors"
              style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)' }}
              onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.35)')}
              onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
            />
          </div>

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
            {loading ? 'Registrando...' : 'Crear cuenta'}
          </button>
        </form>

        <div className="mt-6 flex justify-between">
          <Link href="/login" className="text-white/40 text-sm">¿Ya tienes cuenta? Ingresa</Link>
        </div>
      </div>
    </div>
  );
}