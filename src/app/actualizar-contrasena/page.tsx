'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function ActualizarContrasenaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error: e }) => {
        if (e) setError(e.message);
      });
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return; }
    if (password.length < 6) { setError('Mínimo 6 caracteres'); return; }

    setLoading(true);
    setError('');

    const { error: updateErr } = await supabase.auth.updateUser({ password });

    if (updateErr) {
      setError(updateErr.message);
      setLoading(false);
      return;
    }

    setDone(true);
    setLoading(false);
  }

  if (done) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center px-6"
        style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}
      >
        <div className="w-full max-w-[360px] text-center">
          <div className="text-6xl mb-6">✅</div>
          <div className="font-barlow-condensed text-3xl font-bold text-white mb-3">
            Contraseña actualizada
          </div>
          <p className="text-white/50 text-sm mb-8">
            Tu contraseña fue actualizada exitosamente. Ahora puedes ingresar con tu correo y nueva contraseña.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="w-full py-3.5 rounded-xl font-barlow-condensed text-lg font-bold tracking-wider text-white uppercase cursor-pointer active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', boxShadow: '0 8px 24px rgba(37,99,235,0.4)' }}
          >
            Ir al login
          </button>
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
          <div className="font-barlow-condensed text-4xl font-bold text-white tracking-widest mb-1">KiosClub</div>
          <div className="text-[11px] text-white/40 uppercase tracking-widest">Crear nueva contraseña</div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-white/45 uppercase tracking-wider pl-1">Nueva contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="Mínimo 6 caracteres"
              className="w-full px-4 py-3.5 rounded-xl border text-white placeholder:text-white/30 text-sm focus:outline-none"
              style={{ background:'rgba(255,255,255,0.08)', borderColor:'rgba(255,255,255,0.12)' }}
              onFocus={e => (e.target.style.borderColor='rgba(255,255,255,0.35)')}
              onBlur={e  => (e.target.style.borderColor='rgba(255,255,255,0.12)')} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-white/45 uppercase tracking-wider pl-1">Confirmar contraseña</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
              placeholder="Repite la contraseña"
              className="w-full px-4 py-3.5 rounded-xl border text-white placeholder:text-white/30 text-sm focus:outline-none"
              style={{ background:'rgba(255,255,255,0.08)', borderColor:'rgba(255,255,255,0.12)' }}
              onFocus={e => (e.target.style.borderColor='rgba(255,255,255,0.35)')}
              onBlur={e  => (e.target.style.borderColor='rgba(255,255,255,0.12)')} />
          </div>

          {error && (
            <div className="text-sm text-red-400 text-center px-2 py-2 rounded-lg"
                 style={{ background:'rgba(211,47,47,0.12)' }}>{error}</div>
          )}

          <button type="submit" disabled={loading || password !== confirm}
            className="mt-2 w-full py-3.5 rounded-xl font-barlow-condensed text-lg font-bold tracking-wider text-white uppercase cursor-pointer disabled:opacity-50 active:scale-95 transition-all"
            style={{
              background: loading ? 'rgba(37,99,235,0.5)' : 'linear-gradient(135deg,#2563EB,#1D4ED8)',
              boxShadow: loading ? 'none' : '0 8px 24px rgba(37,99,235,0.4)',
            }}>
            {loading ? 'Guardando...' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ActualizarContrasenaPage() {
  return (
    <Suspense>
      <ActualizarContrasenaContent />
    </Suspense>
  );
}
