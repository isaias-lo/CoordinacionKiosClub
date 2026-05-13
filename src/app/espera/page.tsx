'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function EsperaPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');

  useEffect(() => {
    const email_ = sessionStorage.getItem('pendingEmail') ?? '';
    setEmail(email_);

    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/registro'); return; }

      const role = (user.user_metadata?.role as string) ?? 'pending';
      if (role !== 'pending') {
        router.push('/login');
      } else {
        setChecking(false);
      }
    }
    check();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    sessionStorage.removeItem('pendingEmail');
    router.push('/login');
  }

  if (checking) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}
      >
        <div className="font-barlow-condensed text-2xl text-white/60">Verificando...</div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-6"
      style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}
    >
      <div className="w-full max-w-[400px] text-center">
        <div className="text-6xl mb-6">⏳</div>
        <div className="font-barlow-condensed text-3xl font-bold text-white mb-4">
          Cuenta en revisión
        </div>
        <p className="text-white/50 text-sm mb-3">
          Tu correo <strong className="text-white/70">{email}</strong> fue verificado.
        </p>
        <p className="text-white/50 text-sm mb-10">
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

        <button
          onClick={handleLogout}
          className="w-full py-3.5 rounded-xl font-barlow-condensed text-lg font-bold tracking-wider text-white/60 uppercase cursor-pointer active:scale-95 transition-all"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}