'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import { supabase } from '../lib/supabase';
import { Settings, Users, Bell, LogOut } from 'lucide-react';

const ROLE_LABEL: Record<string, string> = {
  auditor: 'Auditor', 'admin-auditoria': 'Admin Auditoría', despachador: 'Despachador', admin: 'Admin', 'recepcion-tienda': 'Recepción Tienda', 'supervisor-picking': 'Supervisor Picking',
};

function AccountMenu({ onClose, isAdmin, pendingCount }: { onClose: () => void; isAdmin: boolean; pendingCount: number }) {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email);
    });
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (!profile) return null;
  const initial = (profile.full_name ?? 'U')[0].toUpperCase();

  type IconBg = { from: string; to: string; shadow: string };

  const iconBox = (Icon: React.ElementType, bg: IconBg) => (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
         style={{
           background: `linear-gradient(145deg, ${bg.from}, ${bg.to})`,
           boxShadow: `0 4px 12px ${bg.shadow}, inset 0 1px 0 rgba(255,255,255,0.25)`,
         }}>
      <Icon size={18} color="#fff" strokeWidth={1.8} />
    </div>
  );

  const menuItem = (onClick: () => void, Icon: React.ElementType, bg: IconBg, label: string, badge?: number) => (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-white/85 cursor-pointer transition-all text-left"
      style={{ background: 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      {iconBox(Icon, bg)}
      <span className="text-[17px] font-medium flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="w-5 h-5 rounded-full text-[11px] font-bold text-black flex items-center justify-center flex-shrink-0"
              style={{ background: '#EAB308' }}>
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <div ref={menuRef}
         className="absolute top-full right-0 mt-2 w-72 rounded-2xl overflow-hidden shadow-2xl z-50"
         style={{ background: '#162048', border: '1px solid rgba(255,255,255,0.12)' }}>

      {/* Header */}
      <div className="flex flex-col items-center pt-6 pb-4 px-4 gap-2"
           style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white"
             style={{
               background: 'linear-gradient(145deg, #3B6FE8, #1A3FAA)',
               boxShadow: '0 8px 24px rgba(37,99,235,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
             }}>
          {initial}
        </div>
        <div className="text-white font-semibold text-[20px] text-center leading-tight">
          {profile.full_name ?? 'Usuario'}
        </div>
        {email && (
          <div className="text-white/45 text-[15px] text-center">{email}</div>
        )}
        <div className="text-[13px] text-white/30 uppercase tracking-widest mt-0.5">
          {ROLE_LABEL[profile.role] ?? profile.role}
        </div>
      </div>

      {/* Actions */}
      <div className="py-3 flex flex-col gap-0.5">
        {menuItem(() => { onClose(); router.push('/perfil'); },
          Settings,
          { from: '#6B7280', to: '#4B5563', shadow: 'rgba(107,114,128,0.4)' },
          'Gestionar cuenta'
        )}

        {isAdmin && <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 16px' }} />}
        {isAdmin && menuItem(() => { onClose(); router.push('/admin/usuarios'); },
          Users,
          { from: '#2563EB', to: '#1D4ED8', shadow: 'rgba(37,99,235,0.45)' },
          'Usuarios'
        )}
        {isAdmin && menuItem(() => { onClose(); router.push('/admin/usuarios'); },
          Bell,
          { from: '#D97706', to: '#B45309', shadow: 'rgba(217,119,6,0.45)' },
          'Pendientes',
          pendingCount
        )}

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 16px' }} />

        <button
          onClick={async () => { onClose(); await signOut(); router.push('/login'); }}
          className="w-full flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all text-left"
          style={{ background: 'transparent' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{
                 background: 'linear-gradient(145deg, #EF4444, #B91C1C)',
                 boxShadow: '0 4px 12px rgba(239,68,68,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
               }}>
            <LogOut size={18} color="#fff" strokeWidth={1.8} />
          </div>
          <span className="text-[17px] font-medium text-white/70">Cerrar sesión</span>
        </button>
      </div>
    </div>
  );
}

export function LaunchScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [stats, setStats] = useState({ dias: 0, pallets: 0, bultos: 0 });
  const [pendingCount, setPendingCount] = useState(0);
  const [showMenu, setShowMenu] = useState(false);

  const isAdmin           = profile?.role === 'admin';
  const isRecepcion       = profile?.role === 'recepcion-tienda';
  const isSupervisorPick  = profile?.role === 'supervisor-picking';

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

  const initial = (profile?.full_name ?? 'U')[0].toUpperCase();

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-0 px-6 py-10 overflow-y-auto"
         style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

      {/* Profile — top-right corner, both desktop and mobile */}
      {profile && (
        <div className="absolute top-4 right-4 z-20">
          <div className="relative">

            {/* Desktop: pill con nombre */}
            <button
              onClick={() => setShowMenu(v => !v)}
              className="hidden md:flex items-center gap-3 pl-1.5 pr-4 py-1.5 rounded-full cursor-pointer transition-all active:scale-95"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-[17px] font-bold text-white flex-shrink-0"
                   style={{ background: 'rgba(37,99,235,0.55)' }}>
                {initial}
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-white text-[17px] font-medium">{profile.full_name ?? 'Usuario'}</span>
                <span className="text-[13px] text-white/40 uppercase tracking-wider mt-[2px]">{ROLE_LABEL[profile.role] ?? profile.role}</span>
              </div>
              <span className="text-white/40 text-[12px] ml-1">{showMenu ? '▲' : '▼'}</span>
            </button>

            {/* Mobile: solo el círculo con badge de pendientes */}
            <button
              onClick={() => setShowMenu(v => !v)}
              className="md:hidden relative flex items-center justify-center w-11 h-11 rounded-full cursor-pointer transition-all active:scale-95"
              style={{ background: 'rgba(37,99,235,0.55)', border: '2px solid rgba(255,255,255,0.15)' }}>
              <span className="text-[18px] font-bold text-white">{initial}</span>
              {isAdmin && pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold text-black flex items-center justify-center"
                      style={{ background: '#EAB308' }}>
                  {pendingCount}
                </span>
              )}
            </button>

            {showMenu && (
              <AccountMenu
                onClose={() => setShowMenu(false)}
                isAdmin={isAdmin}
                pendingCount={pendingCount}
              />
            )}
          </div>
        </div>
      )}

      {/* Logo */}
      <div className="mb-6 flex items-center justify-center">
        <div className="flex flex-col gap-[3px] leading-none">
          <div className="flex items-baseline gap-[2px]">
            <span style={{ fontSize: 28, fontWeight: 800, color: '#D42B2B', letterSpacing: '-0.5px', fontFamily: 'Barlow Condensed, sans-serif' }}>KIOS</span>
            <span style={{ fontSize: 22, fontStyle: 'italic', fontWeight: 700, color: '#D42B2B', fontFamily: 'Barlow Condensed, sans-serif' }}>Club</span>
          </div>
          <div className="flex gap-[3px] rounded-[2px] px-1.5 py-[3px]" style={{ background: '#1B2A6B' }}>
            {[0,1,2,3,4].map(i => <span key={i} style={{ color: '#fff', fontSize: 8 }}>★</span>)}
          </div>
        </div>
      </div>

      <div className="font-barlow-condensed text-xs font-semibold tracking-widest uppercase text-white/50 mb-1 text-center">
        Sistema de despacho
      </div>
      <div className="font-barlow-condensed text-3xl font-bold text-white text-center mb-10 leading-tight">
        ¿A dónde vas hoy?
      </div>

      {/* Vista recepcion-tienda */}
      {isRecepcion ? (
        <div className="w-full max-w-sm mb-8">
          <button
            onClick={() => router.push('/tiendas')}
            className="w-full relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[rgba(16,185,129,0.5)]"
            style={{ height: 110, background: 'rgba(16,185,129,0.18)', boxShadow: '0 8px 24px rgba(16,185,129,0.25)' }}>
            <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Tiendas / Recepción</div>
            <div className="text-xs text-white/60 mt-1">Confirmar recepción de despacho</div>
          </button>
        </div>
      ) : isSupervisorPick ? (
        <div className="w-full max-w-sm mb-8">
          <button
            onClick={() => router.push('/picking')}
            className="w-full relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[rgba(234,179,8,0.5)]"
            style={{ height: 88, background: 'rgba(234,179,8,0.14)', boxShadow: '0 8px 24px rgba(234,179,8,0.28)' }}>
            <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Picking</div>
            <div className="text-xs text-white/60 mt-1">Supervisión de operaciones</div>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 w-full max-w-sm mb-10" style={{ gridAutoRows: '88px' }}>
          <button onClick={() => router.push('/despacho-hub')}
            className="relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95"
            style={{ background: 'rgba(37,99,235,0.18)', border: '2px solid rgba(37,99,235,0.40)', boxShadow: '0 8px 24px rgba(37,99,235,0.22)' }}>
            <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Despacho</div>
            <div className="text-xs text-white/55 mt-1">Bodegas · Enrutador</div>
          </button>
          <button onClick={() => router.push('/control-interno')}
            className="relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95"
            style={{ background: 'rgba(16,185,129,0.16)', border: '2px solid rgba(16,185,129,0.40)', boxShadow: '0 8px 24px rgba(16,185,129,0.18)' }}>
            <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Control Interno</div>
            <div className="text-xs text-white/55 mt-1">Tiendas · Auditoría</div>
          </button>
          {isAdmin && (
            <button
              onClick={() => router.push('/picking')}
              className="col-span-2 relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[rgba(234,179,8,0.5)]"
              style={{ background: 'rgba(234,179,8,0.14)', boxShadow: '0 8px 24px rgba(234,179,8,0.25)' }}>
              <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Picking</div>
              <div className="text-xs text-white/55 mt-1">Supervisión de operaciones</div>
            </button>
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


    </div>
  );
}
