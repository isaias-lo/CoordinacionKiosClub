'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';
import { useAuth } from '../components/AuthProvider';
import { supabase } from '../lib/supabase';

const ROLE_LABEL: Record<string, string> = {
  auditor: 'Auditor', 'admin-auditoria': 'Admin Auditoría', despachador: 'Despachador', admin: 'Admin', 'recepcion-tienda': 'Recepción Tienda',
};


export function LaunchScreen() {
  const { dispatch } = useApp();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const [stats, setStats] = useState({ dias: 0, pallets: 0, bultos: 0 });
  const [pendingCount, setPendingCount] = useState(0);
  const [activeModule, setActiveModule] = useState<'despacho' | 'control'>('despacho');

  const isAdmin     = profile?.role === 'admin';
  const isRecepcion = profile?.role === 'recepcion-tienda';

  const loadPending = useCallback(async () => {
    if (!isAdmin) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json() as { users?: { role: string }[] };
    if (data.users) {
      setPendingCount(data.users.filter((u: { role: string }) => u.role === 'pending').length);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadPending();
    const interval = setInterval(loadPending, 30000);
    return () => clearInterval(interval);
  }, [loadPending]);

  useEffect(() => {
    supabase
      .from('dispatch_history')
      .select('total_pallets, total_bultos')
      .then(({ data }) => {
        if (data && data.length > 0) {
          let pallets = 0, bultos = 0;
          data.forEach((r: { total_pallets: number; total_bultos: number }) => {
            pallets += r.total_pallets || 0;
            bultos  += r.total_bultos  || 0;
          });
          setStats({ dias: data.length, pallets, bultos });
        }
      });
  }, []);

  const goToRegiones = () => {
    dispatch({ type: 'CLEAR_ALL' });
    dispatch({ type: 'SET_TIENDA', payload: null });
    dispatch({ type: 'SET_TAB', payload: 0 });
    router.push('/despacho/regiones');
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-0 px-6 py-10 overflow-y-auto"
         style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

      {/* Logo */}
      <div className="w-48 h-16 mb-6 flex items-center justify-center">
        <span className="font-barlow-condensed text-3xl font-bold text-white tracking-widest">KiosClub</span>
      </div>

      <div className="font-barlow-condensed text-xs font-semibold tracking-widest uppercase text-white/50 mb-1 text-center">
        Sistema de despacho
      </div>
      <div className="font-barlow-condensed text-3xl font-bold text-white text-center mb-8 leading-tight">
        ¿A dónde vas hoy?
      </div>

      {/* Vista recepcion-tienda */}
      {isRecepcion ? (
        <div className="w-full max-w-sm mb-8">
          <button
            onClick={() => router.push('/tiendas')}
            className="w-full relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[rgba(16,185,129,0.5)]"
            style={{ height: 88, background: 'rgba(16,185,129,0.18)', boxShadow: '0 8px 24px rgba(16,185,129,0.25)' }}>
            <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Tiendas / Recepción</div>
            <div className="text-xs text-white/60 mt-1">Confirmar recepción de despacho</div>
          </button>
        </div>
      ) : (
        <div className="w-full max-w-sm mb-8 flex flex-col gap-4">

          {/* ── Tab selector ── */}
          <div className="flex rounded-2xl p-1 gap-1"
               style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
            {(['despacho', 'control'] as const).map(m => {
              const active = activeModule === m;
              const label  = m === 'despacho' ? 'Despacho' : 'Control Interno';
              return (
                <button key={m} onClick={() => setActiveModule(m)}
                  className="flex-1 rounded-xl py-2.5 cursor-pointer transition-all active:scale-[0.97]"
                  style={{
                    background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                    border: active ? '1px solid rgba(255,255,255,0.18)' : '1px solid transparent',
                    boxShadow: active ? '0 2px 12px rgba(0,0,0,0.25)' : 'none',
                  }}>
                  <span className="font-barlow-condensed text-sm font-bold tracking-[0.15em] uppercase"
                        style={{ color: active ? '#fff' : 'rgba(255,255,255,0.38)' }}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Contenido del tab activo ── */}
          {activeModule === 'despacho' && (
            <div className="grid grid-cols-2 gap-2.5" style={{ gridAutoRows: '82px' }}>

              <button onClick={goToRegiones}
                className="relative overflow-hidden rounded-2xl px-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[#B71C1C]"
                style={{ background: '#D32F2F', boxShadow: '0 6px 20px rgba(211,47,47,0.38)' }}>
                <div className="font-barlow-condensed text-base font-bold text-white tracking-widest uppercase leading-tight">Bodega Regiones</div>
                <div className="text-[11px] text-white/60 mt-0.5">Despacho nacional</div>
              </button>

              <button onClick={() => router.push('/despacho/santiago')}
                className="relative overflow-hidden rounded-2xl px-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-info/40"
                style={{ background: 'rgba(37,99,235,0.18)', boxShadow: '0 6px 20px rgba(37,99,235,0.25)' }}>
                <div className="font-barlow-condensed text-base font-bold text-white tracking-widest uppercase leading-tight">Bodega Santiago</div>
                <div className="text-[11px] text-white/60 mt-0.5">Despacho local RM</div>
              </button>

              <button onClick={() => router.push('/despacho')}
                className="relative overflow-hidden rounded-2xl px-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[rgba(34,197,94,0.50)]"
                style={{ background: 'rgba(34,197,94,0.16)', boxShadow: '0 6px 20px rgba(34,197,94,0.20)' }}>
                <div className="font-barlow-condensed text-base font-bold text-white tracking-widest uppercase leading-tight">Enrutador</div>
                <div className="text-[11px] text-white/60 mt-0.5">Sistema de enrutamiento</div>
              </button>

              <button onClick={() => router.push('/despacho/estado')}
                className="relative overflow-hidden rounded-2xl px-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[rgba(245,158,11,0.50)]"
                style={{ background: 'rgba(245,158,11,0.13)', boxShadow: '0 6px 20px rgba(245,158,11,0.18)' }}>
                <div className="font-barlow-condensed text-base font-bold text-white tracking-widest uppercase leading-tight">Estado / Seguimiento</div>
                <div className="text-[11px] text-white/60 mt-0.5">Etiquetas · Guías · QR</div>
              </button>

            </div>
          )}

          {activeModule === 'control' && (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gridAutoRows: '82px' }}>

              <button onClick={() => router.push('/tiendas')}
                className="relative overflow-hidden rounded-2xl px-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[rgba(16,185,129,0.5)]"
                style={{ background: 'rgba(16,185,129,0.18)', boxShadow: '0 6px 20px rgba(16,185,129,0.20)' }}>
                <div className="font-barlow-condensed text-base font-bold text-white tracking-widest uppercase leading-tight">Tiendas</div>
                <div className="text-[11px] text-white/60 mt-0.5">Recepción de despacho</div>
              </button>

              {isAdmin && (
                <button onClick={() => router.push('/auditoria')}
                  className="relative overflow-hidden rounded-2xl px-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[rgba(124,58,237,0.50)]"
                  style={{ background: 'rgba(124,58,237,0.16)', boxShadow: '0 6px 20px rgba(124,58,237,0.20)' }}>
                  <div className="font-barlow-condensed text-base font-bold text-white tracking-widest uppercase leading-tight">Auditoría</div>
                  <div className="text-[11px] text-white/60 mt-0.5">Control de calidad pallets</div>
                </button>
              )}

            </div>
          )}

        </div>
      )}

      {/* Stats */}
      <div className="flex gap-5">
        {[['dias', 'días'], ['pallets', 'pallets'], ['bultos', 'bultos']].map(([k, l]) => (
          <div key={k} className="text-center">
            <div className="font-mono text-2xl font-medium text-white">{stats[k as keyof typeof stats]}</div>
            <div className="text-[11px] text-white/50 uppercase tracking-wider mt-0.5">{l}</div>
          </div>
        ))}
      </div>

      {/* Bottom actions */}
      <div className="flex flex-wrap justify-center gap-2 mt-4">
        {isAdmin && pendingCount > 0 && (
          <button
            onClick={() => router.push('/admin/usuarios')}
            className="relative px-4 py-2.5 rounded-full font-barlow text-[13px] cursor-pointer border transition-all active:scale-95"
            style={{ borderColor: 'rgba(234,179,8,0.5)', color: '#EAB308', background: 'rgba(234,179,8,0.1)' }}>
            🔔 Pendientes
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-[10px] font-bold text-black flex items-center justify-center"
                  style={{ background: '#EAB308' }}>
              {pendingCount}
            </span>
          </button>
        )}
        <button onClick={() => router.push('/historial')}
          className="px-4 py-2.5 rounded-full font-barlow text-[13px] cursor-pointer border border-white/20 text-white/65 bg-white/8 hover:bg-white/15 hover:text-white transition-all">
          📋 Historial
        </button>
        <button onClick={() => router.push('/registros')}
          className="px-4 py-2.5 rounded-full font-barlow text-[13px] cursor-pointer border transition-all"
          style={{ borderColor: 'rgba(16,185,129,0.5)', color: '#10B981', background: 'rgba(16,185,129,0.1)' }}>
          🗄️ Registros
        </button>
        {isAdmin && (
          <button onClick={() => router.push('/admin/usuarios')}
            className="px-4 py-2.5 rounded-full font-barlow text-[13px] cursor-pointer border transition-all"
            style={{ borderColor: 'rgba(217,119,6,0.5)', color: '#D97706', background: 'rgba(217,119,6,0.1)' }}>
            👥 Usuarios
          </button>
        )}
        {isAdmin && (
          <button onClick={() => router.push('/auditoria-admin')}
            className="px-4 py-2.5 rounded-full font-barlow text-[13px] cursor-pointer border transition-all"
            style={{ borderColor: 'rgba(124,58,237,0.5)', color: '#7C3AED', background: 'rgba(124,58,237,0.1)' }}>
            🔍 Revisión Auditoría
          </button>
        )}
        {isAdmin && (
          <button onClick={() => router.push('/admin/tiendas')}
            className="px-4 py-2.5 rounded-full font-barlow text-[13px] cursor-pointer border transition-all"
            style={{ borderColor: 'rgba(16,185,129,0.5)', color: '#10B981', background: 'rgba(16,185,129,0.1)' }}>
            🏪 Tiendas
          </button>
        )}
      </div>

      {/* User badge + logout */}
      {profile && (
        <div className="mt-6 flex items-center gap-3 px-4 py-3 rounded-2xl"
             style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
               style={{ background: 'rgba(37,99,235,0.4)' }}>
            {(profile.full_name ?? 'U')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm font-medium truncate">
              {profile.full_name ?? 'Usuario'}
            </div>
            <div className="text-[11px] text-white/40 uppercase tracking-wider">
              {ROLE_LABEL[profile.role] ?? profile.role}
            </div>
          </div>
          <button
            onClick={() => router.push('/perfil')}
            className="px-3 py-1.5 rounded-full text-[12px] text-white/60 cursor-pointer transition-all hover:text-white hover:bg-white/10"
            style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
            Mi perfil
          </button>
          <button
            onClick={async () => { await signOut(); router.push('/login'); }}
            className="px-3 py-1.5 rounded-full text-[12px] text-white/50 cursor-pointer transition-all hover:text-white hover:bg-white/10"
            style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
            Salir
          </button>
        </div>
      )}
    </div>
  );
}
