'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import { supabase } from '../lib/supabase';
import { Settings, Users, Bell, LogOut, Truck, ClipboardList, Layers, Store } from 'lucide-react';

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
  const router       = useRouter();
  const { profile }  = useAuth();
  const [stats, setStats]           = useState({ dias: 0, pallets: 0, bultos: 0 });
  const [pendingCount, setPendingCount] = useState(0);
  const [showMenu, setShowMenu]     = useState(false);
  const [isMobile, setIsMobile]           = useState(false);
  const [skipAnim, setSkipAnim]           = useState(true);

  const isAdmin          = profile?.role === 'admin';
  const isRecepcion      = profile?.role === 'recepcion-tienda';
  const isSupervisorPick = profile?.role === 'supervisor-picking';

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 480);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const already = sessionStorage.getItem('home_animated');
    setSkipAnim(!!already);
    if (!already) {
      const t = setTimeout(() => sessionStorage.setItem('home_animated', '1'), 1200);
      return () => clearTimeout(t);
    }
  }, []);

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

  const todayLabel = (() => {
    const s = new Date().toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  return (
    <>
      <style>{`
        @keyframes ls-from-left   { from { opacity:0; transform: translateX(-60px); } to { opacity:1; transform: translateX(0); } }
        @keyframes ls-from-right  { from { opacity:0; transform: translateX(60px);  } to { opacity:1; transform: translateX(0); } }
        @keyframes ls-from-bottom { from { opacity:0; transform: translateY(50px);  } to { opacity:1; transform: translateY(0); } }
        @keyframes ls-from-bottom2{ from { opacity:0; transform: translateY(70px);  } to { opacity:1; transform: translateY(0); } }
        @keyframes ls-from-top    { from { opacity:0; transform: translateY(-50px); } to { opacity:1; transform: translateY(0); } }
        @keyframes ls-logo-spring { from { opacity:0; transform: scale(0.75); }      to { opacity:1; transform: scale(1); } }
        @keyframes ls-fade-in     { from { opacity:0; } to { opacity:1; } }

        @media (max-width: 480px) {
          .ls-animate .ls-mobile-hdr  { animation: ls-from-top    0.55s cubic-bezier(0.34,1.56,0.64,1) 0.35s both; }
          .ls-animate .ls-logo        { animation: ls-logo-spring  0.7s  cubic-bezier(0.34,1.5,0.64,1)  0.05s both; }
          .ls-animate .ls-tagline     { animation: ls-logo-spring  0.7s  cubic-bezier(0.34,1.5,0.64,1)  0.08s both; }
          .ls-animate .ls-title       { animation: ls-logo-spring  0.7s  cubic-bezier(0.34,1.5,0.64,1)  0.11s both; }
          .ls-animate .ls-card-0      { animation: ls-from-left    0.6s  cubic-bezier(0.34,1.56,0.64,1) 0.18s both; }
          .ls-animate .ls-card-1      { animation: ls-from-right   0.6s  cubic-bezier(0.34,1.56,0.64,1) 0.18s both; }
          .ls-animate .ls-card-2      { animation: ls-from-bottom  0.6s  cubic-bezier(0.34,1.56,0.64,1) 0.28s both; }
          .ls-animate .ls-card-solo   { animation: ls-logo-spring  0.65s cubic-bezier(0.34,1.56,0.64,1) 0.15s both; }
          .ls-animate .ls-stats-row   { animation: ls-from-bottom2 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.35s both; }

          .ls-root {
            justify-content: flex-start !important;
            align-items: stretch !important;
            overflow: hidden !important;
            padding: 0 !important;
            height: 100dvh !important;
          }
          .ls-mobile-hdr { display: flex !important; }
          .ls-avatar-float { display: none !important; }
          .ls-logo {
            margin-bottom: 4px !important;
            padding: 6px 24px 0 !important;
            justify-content: center !important;
          }
          .ls-tagline { margin-bottom: 2px !important; padding: 0 24px; }
          .ls-title   { margin-bottom: 8px !important;  padding: 0 24px; }
          .ls-cards-outer {
            flex: 1 !important;
            min-height: 0;
            width: 100% !important;
            max-width: 100% !important;
            margin-bottom: 0 !important;
            padding: 0 16px !important;
            display: flex !important;
            flex-direction: column !important;
            box-sizing: border-box;
          }
          .ls-cards-outer > button {
            flex: 1;
            height: auto !important;
            min-height: 120px;
          }
          .ls-cards-grid {
            flex: 1 !important;
            height: 100% !important;
            grid-auto-rows: 1fr !important;
            margin-bottom: 0 !important;
          }
          .ls-card-icon { display: flex !important; }
          .ls-nav-card {
            align-items: flex-start !important;
            padding-left: 16px !important;
            padding-top: 14px !important;
            text-align: left !important;
          }
          .ls-stats-row {
            display: grid !important;
            grid-template-columns: 1fr 1fr 1fr !important;
            gap: 0 !important;
            padding: 10px 24px 16px !important;
            border-top: 1px solid rgba(255,255,255,0.08);
            flex-shrink: 0;
          }
          .ls-stat-item {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
          }
          .ls-stat-item + .ls-stat-item { border-left: 1px solid rgba(255,255,255,0.12); }
        }
      `}</style>

      <div className={`ls-root${skipAnim ? '' : ' ls-animate'} fixed inset-0 flex flex-col items-center justify-center gap-0 px-6 py-10 overflow-y-auto`}
           style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

        {/* Mobile compact header — hidden on desktop via inline style, shown via CSS media query */}
        <div className="ls-mobile-hdr"
             style={{ display: 'none', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', flexShrink: 0 }}>
          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: 600, letterSpacing: '0.02em' }}>
            {todayLabel}
          </span>
          {profile && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowMenu(v => !v)}
                style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(37,99,235,0.55)', border: '2px solid rgba(255,255,255,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{initial}</span>
                {isAdmin && pendingCount > 0 && (
                  <span style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: '#EAB308', fontSize: 10, fontWeight: 700, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {pendingCount}
                  </span>
                )}
              </button>
              {showMenu && isMobile && (
                <AccountMenu onClose={() => setShowMenu(false)} isAdmin={isAdmin} pendingCount={pendingCount} />
              )}
            </div>
          )}
        </div>

        {/* Profile — floating avatar, desktop only (hidden on mobile via CSS) */}
        {profile && (
          <div className="ls-avatar-float absolute top-4 right-4 z-20">
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

              {/* Mobile: solo el círculo (sólo activo entre 481px–767px; en ≤480px usa el mobile header) */}
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

              {showMenu && !isMobile && (
                <AccountMenu onClose={() => setShowMenu(false)} isAdmin={isAdmin} pendingCount={pendingCount} />
              )}
            </div>
          </div>
        )}

        {/* Logo */}
        <div className="ls-logo mb-6 flex items-center justify-center">
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

        <div className="ls-tagline font-barlow-condensed text-xs font-semibold tracking-widest uppercase text-white/50 mb-1 text-center">
          Sistema de despacho
        </div>
        <div className="ls-title font-barlow-condensed text-3xl font-bold text-white text-center mb-10 leading-tight">
          ¿A dónde vas hoy?
        </div>

        {/* Vista recepcion-tienda */}
        {isRecepcion ? (
          <div className="ls-cards-outer w-full max-w-sm mb-8">
            <button
              onClick={() => router.push('/tiendas')}
              className="ls-nav-card ls-card-solo w-full relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[rgba(16,185,129,0.5)]"
              style={{ height: 110, background: 'rgba(16,185,129,0.18)', boxShadow: '0 8px 24px rgba(16,185,129,0.25)' }}>
              <div className="ls-card-icon" style={{ display: 'none', marginBottom: 8 }}>
                <Store size={20} color="rgba(52,211,153,0.9)" strokeWidth={1.8} />
              </div>
              <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Tiendas / Recepción</div>
              <div className="text-xs text-white/60 mt-1">Confirmar recepción de despacho</div>
            </button>
          </div>
        ) : isSupervisorPick ? (
          <div className="ls-cards-outer w-full max-w-sm mb-8">
            <button
              onClick={() => router.push('/picking')}
              className="ls-nav-card ls-card-solo w-full relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[rgba(234,179,8,0.5)]"
              style={{ height: 88, background: 'rgba(234,179,8,0.14)', boxShadow: '0 8px 24px rgba(234,179,8,0.28)' }}>
              <div className="ls-card-icon" style={{ display: 'none', marginBottom: 8 }}>
                <Layers size={20} color="rgba(234,179,8,0.9)" strokeWidth={1.8} />
              </div>
              <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Picking</div>
              <div className="text-xs text-white/60 mt-1">Supervisión de operaciones</div>
            </button>
          </div>
        ) : (
          <div className="ls-cards-outer w-full max-w-sm">
            <div className="ls-cards-grid grid grid-cols-2 gap-3 mb-10" style={{ gridAutoRows: '88px' }}>
              <button onClick={() => router.push('/despacho-hub')}
                className="ls-nav-card ls-card-0 relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95"
                style={{ background: 'rgba(37,99,235,0.18)', border: '2px solid rgba(37,99,235,0.40)', boxShadow: '0 8px 24px rgba(37,99,235,0.22)' }}>
                <div className="ls-card-icon" style={{ display: 'none', marginBottom: 8 }}>
                  <Truck size={18} color="rgba(96,165,250,0.9)" strokeWidth={1.8} />
                </div>
                <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Despacho</div>
                <div className="text-xs text-white/55 mt-1">Bodegas · Enrutador</div>
              </button>
              <button onClick={() => router.push('/control-interno')}
                className="ls-nav-card ls-card-1 relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95"
                style={{ background: 'rgba(16,185,129,0.16)', border: '2px solid rgba(16,185,129,0.40)', boxShadow: '0 8px 24px rgba(16,185,129,0.18)' }}>
                <div className="ls-card-icon" style={{ display: 'none', marginBottom: 8 }}>
                  <ClipboardList size={18} color="rgba(52,211,153,0.9)" strokeWidth={1.8} />
                </div>
                <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Control Interno</div>
                <div className="text-xs text-white/55 mt-1">Tiendas · Auditoría</div>
              </button>
              {isAdmin && (
                <button
                  onClick={() => router.push('/picking')}
                  className="ls-nav-card ls-card-2 relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[rgba(234,179,8,0.5)]"
                  style={{ background: 'rgba(234,179,8,0.14)', boxShadow: '0 8px 24px rgba(234,179,8,0.25)' }}>
                  <div className="ls-card-icon" style={{ display: 'none', marginBottom: 8 }}>
                    <Layers size={18} color="rgba(234,179,8,0.9)" strokeWidth={1.8} />
                  </div>
                  <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Picking</div>
                  <div className="text-xs text-white/55 mt-1">Supervisión de operaciones</div>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="ls-stats-row flex gap-5">
          {[['dias', 'días'], ['pallets', 'pallets'], ['bultos', 'bultos']].map(([k, l]) => (
            <div key={k} className="ls-stat-item text-center">
              <div className="font-mono text-2xl font-medium text-white">{stats[k as keyof typeof stats]}</div>
              <div className="text-[11px] text-white/50 uppercase tracking-wider mt-0.5">{l}</div>
            </div>
          ))}
        </div>

      </div>
    </>
  );
}
