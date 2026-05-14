'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';
import { Settings, Users, Bell, LogOut } from 'lucide-react';

const ROLE_LABEL: Record<string, string> = {
  auditor: 'Auditor', 'admin-auditoria': 'Admin Auditoría', despachador: 'Despachador',
  admin: 'Admin', 'recepcion-tienda': 'Recepción Tienda',
};

function iconBox(Icon: React.ElementType, from: string, to: string, shadow: string) {
  return (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
         style={{
           background: `linear-gradient(145deg, ${from}, ${to})`,
           boxShadow: `0 4px 12px ${shadow}, inset 0 1px 0 rgba(255,255,255,0.25)`,
         }}>
      <Icon size={18} color="#fff" strokeWidth={1.8} />
    </div>
  );
}

function MenuItem({ onClick, Icon, from, to, shadow, label, badge }: {
  onClick: () => void; Icon: React.ElementType; from: string; to: string;
  shadow: string; label: string; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-white/85 cursor-pointer transition-all text-left"
      style={{ background: 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      {iconBox(Icon, from, to, shadow)}
      <span className="text-[17px] font-medium flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="w-5 h-5 rounded-full text-[11px] font-bold text-black flex items-center justify-center flex-shrink-0"
              style={{ background: '#EAB308' }}>
          {badge}
        </span>
      )}
    </button>
  );
}

interface ProfilePillProps {
  /** Muestra solo el círculo sin el pill de texto (para headers con poco espacio) */
  compact?: boolean;
}

export function ProfilePill({ compact = false }: ProfilePillProps) {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [email, setEmail] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const isAdmin = profile?.role === 'admin';
  const initial = (profile?.full_name ?? 'U')[0].toUpperCase();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email);
    });
  }, []);

  const loadPending = useCallback(async () => {
    if (!isAdmin) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json() as { users?: { role: string }[] };
    if (data.users) setPendingCount(data.users.filter((u: { role: string }) => u.role === 'pending').length);
  }, [isAdmin]);

  useEffect(() => {
    loadPending();
    const interval = setInterval(loadPending, 30000);
    return () => clearInterval(interval);
  }, [loadPending]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  if (!profile) return null;

  const dropdown = (
    <div className="absolute top-full right-0 mt-2 w-72 rounded-2xl overflow-hidden shadow-2xl z-50"
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
        <div className="text-white font-semibold text-[20px] text-center leading-tight">{profile.full_name ?? 'Usuario'}</div>
        {email && <div className="text-white/45 text-[15px] text-center">{email}</div>}
        <div className="text-[13px] text-white/30 uppercase tracking-widest mt-0.5">{ROLE_LABEL[profile.role] ?? profile.role}</div>
      </div>

      {/* Actions */}
      <div className="py-3 flex flex-col gap-0.5">
        <MenuItem onClick={() => { setShowMenu(false); router.push('/perfil'); }}
          Icon={Settings} from="#6B7280" to="#4B5563" shadow="rgba(107,114,128,0.4)" label="Gestionar cuenta" />

        {isAdmin && <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 16px' }} />}
        {isAdmin && (
          <MenuItem onClick={() => { setShowMenu(false); router.push('/admin/usuarios'); }}
            Icon={Users} from="#2563EB" to="#1D4ED8" shadow="rgba(37,99,235,0.45)" label="Usuarios" />
        )}
        {isAdmin && (
          <MenuItem onClick={() => { setShowMenu(false); router.push('/admin/usuarios'); }}
            Icon={Bell} from="#D97706" to="#B45309" shadow="rgba(217,119,6,0.45)" label="Pendientes" badge={pendingCount} />
        )}

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 16px' }} />

        <button
          onClick={async () => { setShowMenu(false); await signOut(); router.push('/login'); }}
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

  return (
    <div ref={menuRef} className="relative flex-shrink-0">
      {/* Pill completo — desktop (cuando no es compact) */}
      {!compact && (
        <button
          onClick={() => setShowMenu(v => !v)}
          className="hidden md:flex items-center gap-3 pl-1.5 pr-4 py-1.5 rounded-full cursor-pointer transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-[17px] font-bold text-white flex-shrink-0"
               style={{ background: 'linear-gradient(145deg, #3B6FE8, #1A3FAA)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)' }}>
            {initial}
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-white text-[17px] font-medium">{profile.full_name ?? 'Usuario'}</span>
            <span className="text-[13px] text-white/40 uppercase tracking-wider mt-[2px]">{ROLE_LABEL[profile.role] ?? profile.role}</span>
          </div>
          <span className="text-white/40 text-[12px] ml-1">{showMenu ? '▲' : '▼'}</span>
        </button>
      )}

      {/* Círculo — móvil siempre, desktop cuando compact=true */}
      <button
        onClick={() => setShowMenu(v => !v)}
        className={`${compact ? 'flex' : 'md:hidden flex'} relative items-center justify-center w-10 h-10 rounded-full cursor-pointer transition-all active:scale-95`}
        style={{
          background: 'linear-gradient(145deg, #3B6FE8, #1A3FAA)',
          border: '2px solid rgba(255,255,255,0.15)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
        }}>
        <span className="text-[17px] font-bold text-white">{initial}</span>
        {isAdmin && pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold text-black flex items-center justify-center"
                style={{ background: '#EAB308' }}>
            {pendingCount}
          </span>
        )}
      </button>

      {showMenu && dropdown}
    </div>
  );
}
