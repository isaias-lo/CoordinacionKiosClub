'use client';

import Link from 'next/link';
import { KiosLogo } from '@/components/KiosLogo';
import { useState, useEffect, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { borrarCookiesDeSesion, cerrarSesion } from '@/lib/cerrarSesion';
import { destinoTrasLogin, mensajeDeErrorLogin } from '@/lib/login';

/** Último correo que entró en este equipo, para no tener que escribirlo en la handheld. */
const CLAVE_ULTIMO_CORREO = 'kios.login.ultimoCorreo';

function leerUltimoCorreo(): string {
  try { return localStorage.getItem(CLAVE_ULTIMO_CORREO) ?? ''; } catch { return ''; }
}

function leerNext(): string | null {
  try { return new URLSearchParams(window.location.search).get('next'); } catch { return null; }
}

function nombreDe(u: User): string {
  const nombre = (u.user_metadata?.full_name as string | undefined)?.trim();
  return nombre || u.email || 'tu cuenta';
}

export default function LoginPage() {
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Sesión que ya está abierta en este equipo. `undefined` mientras se revisa.
  const [abierta,      setAbierta]      = useState<User | null | undefined>(undefined);
  const [cambiando,    setCambiando]    = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Antes esta página hacía `signOut` al montarse y el middleware mandaba a quien ya tenía sesión
  // de vuelta a su inicio. En una handheld donde había entrado otra persona eso era un rebote:
  // escribir /login llevaba al inicio de la cuenta anterior y no había cómo poner otra. Ahora el
  // middleware deja pasar y acá se ofrece seguir o cambiar de cuenta, a la vista.
  useEffect(() => {
    let vivo = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (vivo) setAbierta(data.session?.user ?? null); })
      .catch(() => { if (vivo) setAbierta(null); });
    const ultimo = leerUltimoCorreo();
    if (ultimo) setEmail(ultimo);
    return () => { vivo = false; };
  }, []);

  // Con el correo ya puesto, el cursor va directo a la contraseña.
  useEffect(() => {
    if (abierta === null && email && !password) passwordRef.current?.focus();
    // Solo al mostrar el formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta]);

  async function cambiarDeCuenta() {
    setCambiando(true);
    // cerrarSesion avisa si quedó trabajo sin enviar, cierra aunque no haya señal y recarga /login.
    const cerro = await cerrarSesion();
    if (!cerro) setCambiando(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    // Si quedó una sesión rota en el equipo se descarta sin llamar a la red. El `signOut` de antes
    // hacía dos llamadas a Supabase por intento (refrescar y cerrar), que suman al límite por IP de
    // la bodega, y si fallaban dejaba la sesión vieja donde estaba.
    borrarCookiesDeSesion();
    const correo = email.trim();
    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email: correo, password });
    if (authErr) {
      setError(mensajeDeErrorLogin(authErr, navigator.onLine));
      setLoading(false);
      return;
    }
    try { localStorage.setItem(CLAVE_ULTIMO_CORREO, correo); } catch { /* sin almacenamiento */ }
    // Carga completa y no `router.push`: si en este equipo antes hubo otra cuenta, cualquier dato
    // suyo que siguiera en memoria (caché de consultas, contextos, caché del router) se descarta y
    // la cuenta nueva arranca de cero. `replace` para que "atrás" no vuelva al formulario.
    window.location.replace(destinoTrasLogin(data.user.user_metadata, leerNext()));
  }

  function olvidarCorreo() {
    try { localStorage.removeItem(CLAVE_ULTIMO_CORREO); } catch { /* nada */ }
    setEmail('');
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

        /* Las manchas se mueven solo donde sobra GPU. En teléfono y handheld quedan quietas: un
           blur de 80px animado repinta toda la pantalla en cada cuadro y gasta batería. */
        @media (max-width: 480px), (prefers-reduced-motion: reduce) {
          .lg-blob { animation: none !important; }
        }

        @media (max-width: 480px) {

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

      {/* Fondo fijo aparte: el contenido va encima en una capa que SÍ hace scroll. Antes todo estaba
          en una caja de alto fijo sin scroll, y en una handheld chica el teclado tapaba Ingresar. */}
      <div
        aria-hidden="true"
        className="fixed inset-0"
        style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)', overflow: 'hidden' }}
      >
        <div className="lg-blob" style={{
          position: 'absolute', top: '-10%', left: '-10%',
          width: 420, height: 420, borderRadius: '50%',
          background: 'rgba(26,58,143,0.75)', filter: 'blur(80px)',
          animation: 'lg-float1 8s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
        <div className="lg-blob" style={{
          position: 'absolute', bottom: '-10%', right: '-10%',
          width: 400, height: 400, borderRadius: '50%',
          background: 'rgba(13,122,110,0.5)', filter: 'blur(80px)',
          animation: 'lg-float2 10s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
        <div className="lg-blob" style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 320, height: 320, borderRadius: '50%',
          background: 'rgba(180,30,30,0.22)', filter: 'blur(80px)',
          marginLeft: -160, marginTop: -160,
          animation: 'lg-float3 7s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      </div>

      <div className="fixed inset-0 overflow-y-auto">
       <div className="min-h-full flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[360px]" style={{ position: 'relative', zIndex: 1 }}>

          {/* Logo desktop (original) */}
          <div className="lg-logo-desktop lg-anim-logo text-center mb-10">
            <KiosLogo className="mx-auto mb-3" style={{ width: 260, maxWidth: '75%' }} />
            <div className="text-[11px] text-white/40 uppercase tracking-widest">
              Sistema interno
            </div>
          </div>

          {/* Logo mobile — matches splash style */}
          <div className="lg-logo-mobile lg-anim-logo" style={{
            display: 'none', flexDirection: 'column', alignItems: 'center',
            marginBottom: 32,
          }}>
            <KiosLogo style={{ width: 'min(70vw, 300px)' }} />
            <div style={{
              marginTop: 8, fontSize: 10,
              color: 'rgba(255,255,255,0.35)',
              letterSpacing: '4px', textTransform: 'uppercase',
            }}>
              Sistema interno
            </div>
          </div>

          {abierta && (
            <div className="lg-anim-form1 flex flex-col gap-3">
              <div className="rounded-xl px-4 py-3.5 text-center"
                   style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                <div className="text-[12px] text-white/50 uppercase tracking-wider font-semibold">
                  Sesión abierta en este equipo
                </div>
                <div className="mt-1 text-white text-[16px] font-semibold break-words">{nombreDe(abierta)}</div>
              </div>
              <button
                type="button"
                onClick={() => window.location.replace(destinoTrasLogin(abierta.user_metadata, leerNext()))}
                disabled={cambiando}
                className="lg-submit w-full py-3.5 rounded-xl font-barlow-condensed text-lg font-bold tracking-wider text-white uppercase cursor-pointer disabled:opacity-50 active:scale-95 transition-all"
                style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', boxShadow: '0 8px 24px rgba(37,99,235,0.4)' }}
              >
                Continuar
              </button>
              <button
                type="button"
                onClick={cambiarDeCuenta}
                disabled={cambiando}
                className="w-full py-3.5 rounded-xl font-barlow-condensed text-lg font-bold tracking-wider text-white uppercase cursor-pointer disabled:opacity-50 active:scale-95 transition-all"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)' }}
              >
                {cambiando ? 'Cerrando sesión...' : 'Entrar con otra cuenta'}
              </button>
            </div>
          )}

          {abierta === null && (<>
          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="lg-anim-form1 flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between pl-1">
                <label htmlFor="lg-email" className="text-[13px] text-white/60 uppercase tracking-wider font-semibold">
                  Correo electrónico
                </label>
                {email && (
                  <button type="button" onClick={olvidarCorreo}
                    className="text-[12px] text-white/45 hover:text-white/80 bg-transparent border-none cursor-pointer p-0">
                    Otro correo
                  </button>
                )}
              </div>
              <input
                id="lg-email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
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
              <label htmlFor="lg-password" className="text-[13px] text-white/60 uppercase tracking-wider pl-1 font-semibold">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="lg-password"
                  ref={passwordRef}
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
              <div role="alert" className="text-sm text-red-400 text-center px-2 py-2 rounded-lg"
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
          </>)}

        </div>
       </div>
      </div>
    </>
  );
}
