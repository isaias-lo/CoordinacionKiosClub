'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const ROLE_HOME: Record<string, string> = {
  auditor:            '/auditoria',
  'admin-auditoria':  '/auditoria',
  despachador:        '/',
  admin:              '/',
  'recepcion-tienda': '/tiendas',
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

export default function LoginPage() {
  const router = useRouter();
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Al montar la página de login, limpia cualquier sesión local stale (cookies/localStorage
  // del cliente Supabase) sin tocar el servidor. Previene que estado corrupto de sesiones
  // anteriores (ej. ventana incógnita) bloquee un nuevo intento de login.
  useEffect(() => {
    supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    // Segunda limpieza justo antes del intento, por si el useEffect aún no completó
    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr) {
      setError(mapError(authErr.message));
      setLoading(false);
      return;
    }
    const role = (data.user.user_metadata?.role as string) ?? 'auditor';
    router.push(ROLE_HOME[role] ?? '/auditoria');
    router.refresh();
  }

  return (
    <>
      <style>{`
        @keyframes lg-float1 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%      { transform: translate(30px,-20px) scale(1.08); }
          66%      { transform: translate(-15px,25px) scale(0.95); }
        }
        @keyframes lg-float2 {
          0%,100% { transform: translate(0,0) scale(1); }
          40%      { transform: translate(-25px,-30px) scale(1.05); }
          70%      { transform: translate(20px,15px) scale(0.97); }
        }
        @keyframes lg-float3 {
          0%,100% { transform: translate(0,0) scale(1); }
          35%      { transform: translate(20px,-15px) scale(1.06); }
          65%      { transform: translate(-10px,20px) scale(0.96); }
        }
        @keyframes lg-fade-up {
          from { opacity:0; transform: translateY(18px); }
          to   { opacity:1; transform: translateY(0); }
        }
        @keyframes lg-star-in {
          from { opacity:0; transform: scale(0.4); }
          to   { opacity:1; transform: scale(1); }
        }
        @keyframes lg-fade-in {
          from { opacity:0; } to { opacity:1; }
        }

        @media (max-width: 480px) {
          .lg-root {
            align-items: center !important;
            justify-content: center !important;
            padding: 0 24px !important;
            height: 100dvh !important;
            overflow: hidden !important;
          }

          .lg-logo-desktop { display: none !important; }
          .lg-logo-mobile  { display: flex !important; }
          .lg-input {
            background: rgba(255,255,255,0.07) !important;
            border-color: rgba(255,255,255,0.11) !important;
            border-radius: 12px !important;
            padding: 14px 16px !important;
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
          }
          .lg-input:focus {
            border-color: rgba(42,91,215,0.8) !important;
            outline: none !important;
          }
          .lg-submit {
            background: #2a5bd7 !important;
            border-radius: 12px !important;
            box-shadow: 0 6px 28px rgba(42,91,215,0.5) !important;
            letter-spacing: 2px !important;
          }
          .lg-links { color: rgba(255,255,255,0.4) !important; }
          .lg-anim-logo  { animation: lg-fade-up 0.5s ease 0.05s both; }
          .lg-anim-form1 { animation: lg-fade-up 0.5s ease 0.20s both; }
          .lg-anim-form2 { animation: lg-fade-up 0.5s ease 0.35s both; }
          .lg-anim-form3 { animation: lg-fade-up 0.5s ease 0.50s both; }
          .lg-anim-links { animation: lg-fade-up 0.5s ease 0.60s both; }
        }
      `}</style>

      <div
        className="lg-root fixed inset-0 flex items-center justify-center px-6"
        style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)', overflow: 'hidden' }}
      >
        {/* Animated blobs — visible on all devices */}
        <div style={{
          position: 'absolute', top: '-10%', left: '-10%',
          width: 420, height: 420, borderRadius: '50%',
          background: 'rgba(26,58,143,0.75)', filter: 'blur(80px)',
          animation: 'lg-float1 8s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-10%', right: '-10%',
          width: 400, height: 400, borderRadius: '50%',
          background: 'rgba(13,122,110,0.5)', filter: 'blur(80px)',
          animation: 'lg-float2 10s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 320, height: 320, borderRadius: '50%',
          background: 'rgba(180,30,30,0.22)', filter: 'blur(80px)',
          marginLeft: -160, marginTop: -160,
          animation: 'lg-float3 7s ease-in-out infinite',
          pointerEvents: 'none',
        }} />

        <div className="w-full max-w-[360px]" style={{ position: 'relative', zIndex: 1 }}>

          {/* Logo desktop (original) */}
          <div className="lg-logo-desktop lg-anim-logo text-center mb-10">
            <div className="font-barlow-condensed text-4xl font-bold text-white tracking-widest mb-1">
              KiosClub
            </div>
            <div className="text-[11px] text-white/40 uppercase tracking-widest">
              Sistema de despacho
            </div>
          </div>

          {/* Logo mobile — matches splash style */}
          <div className="lg-logo-mobile lg-anim-logo" style={{
            display: 'none', flexDirection: 'column', alignItems: 'center',
            marginBottom: 32,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{
                fontSize: 52, fontWeight: 800, color: '#d93025',
                letterSpacing: '-1px', lineHeight: 1,
                fontFamily: 'Barlow Condensed, sans-serif',
              }}>KIOS</span>
              <span style={{
                fontSize: 32, fontStyle: 'italic', fontWeight: 700, color: '#fff',
                lineHeight: 1, fontFamily: 'Barlow Condensed, sans-serif',
              }}>Club</span>
            </div>
            <div style={{
              display: 'flex', gap: 4, borderRadius: 2,
              padding: '4px 10px', background: '#1a3a8f',
              marginTop: 7,
            }}>
              {[0,1,2,3,4].map(i => (
                <span key={i} style={{
                  color: '#fff', fontSize: 9,
                  animation: `lg-star-in 0.3s cubic-bezier(0.34,1.5,0.64,1) ${0.2 + i * 0.12}s both`,
                }}>★</span>
              ))}
            </div>
            <div style={{
              marginTop: 8, fontSize: 10,
              color: 'rgba(255,255,255,0.35)',
              letterSpacing: '4px', textTransform: 'uppercase',
            }}>
              Sistema Interno
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="lg-anim-form1 flex flex-col gap-1.5">
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
                className="lg-input w-full px-4 py-3.5 rounded-xl border text-white placeholder:text-white/30 text-sm focus:outline-none transition-colors"
                style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)' }}
                onFocus={e => (e.target.style.borderColor = 'rgba(42,91,215,0.8)')}
                onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
              />
            </div>

            <div className="lg-anim-form2 flex flex-col gap-1.5">
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
                  className="lg-input w-full px-4 py-3.5 pr-12 rounded-xl border text-white placeholder:text-white/30 text-sm focus:outline-none transition-colors"
                  style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)' }}
                  onFocus={e => (e.target.style.borderColor = 'rgba(42,91,215,0.8)')}
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

            <div className="lg-anim-form3">
              <button
                type="submit"
                disabled={loading}
                className="lg-submit mt-2 w-full py-3.5 rounded-xl font-barlow-condensed text-lg font-bold tracking-wider text-white uppercase cursor-pointer disabled:opacity-50 active:scale-95 transition-all"
                style={{
                  background: loading
                    ? 'rgba(37,99,235,0.5)'
                    : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                  boxShadow: loading ? 'none' : '0 8px 24px rgba(37,99,235,0.4)',
                }}
              >
                {loading ? 'Ingresando...' : 'Ingresar'}
              </button>
            </div>
          </form>

          <div className="lg-anim-links mt-6 flex justify-between">
            <Link href="/registro"
              className="lg-links text-white/60 text-[15px] font-semibold hover:text-white/90 transition-colors">
              Crear cuenta
            </Link>
            <Link href="/recuperar-contrasena"
              className="lg-links text-white/60 text-[15px] font-semibold hover:text-white/90 transition-colors">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

        </div>
      </div>
    </>
  );
}
