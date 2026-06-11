'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Truck, ClipboardCheck, PackageCheck, Shield,
  Map, Globe, MapPin, Activity, Navigation as NavIcon,
  Monitor, Store, FileText, AlertTriangle, Inbox,
  CheckSquare, Settings2, ChevronDown, ChevronLeft, ChevronRight,
  LogOut, Users, Search, ArrowLeftRight, Layers,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useSidebar } from './SidebarContext';
import { MODULE_GROUPS } from '@/config/routes';

/* ── Icon registry ─────────────────────────────────────────────── */
const ROUTE_ICONS: Record<string, React.ElementType> = {
  '/':                        LayoutDashboard,
  '/despacho':                Map,
  '/despacho/regiones':       Globe,
  '/despacho/santiago':       MapPin,
  '/despacho/control-flota':  Truck,
  '/despacho/estado':         Activity,
  '/conductor-hub':           NavIcon,
  '/panel-operaciones':       Monitor,
  '/tiendas':                 Store,
  '/registros':               FileText,
  '/incidencias':             AlertTriangle,
  '/control-interno':                Shield,
  '/control-interno/control-cruce': ArrowLeftRight,
  '/recepcion-tienda':               Inbox,
  '/validacion-tienda':       CheckSquare,
  '/admin/tiendas':           Settings2,
  '/despacho/config-tiendas': Settings2,
  '/admin/usuarios':          Users,

  '/auditoria':               ClipboardCheck,
  '/auditoria-admin':         ClipboardCheck,
  '/picking':                 PackageCheck,
};

const GROUP_META: Record<string, { Icon: React.ElementType; color: string }> = {
  despacho:         { Icon: Truck,         color: '#3B82F6' },
  flota:            { Icon: NavIcon,        color: '#EA580C' },
  seguimiento:      { Icon: Activity,      color: '#D97706' },
  'control-interno':{ Icon: Shield,        color: '#10B981' },
  auditoria:        { Icon: ClipboardCheck,color: '#9333EA' },
  abastecimiento:   { Icon: PackageCheck,  color: '#F59E0B' },
  otros:            { Icon: Layers,        color: '#6B7280' },
};

/* ── Helpers ────────────────────────────────────────────────────── */
function isActive(pathname: string | null, path: string) {
  if (!pathname) return false;
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(path + '/');
}

/* ── NavItem ────────────────────────────────────────────────────── */
function NavItem({
  path, label, collapsed,
}: { path: string; label: string; collapsed: boolean }) {
  const pathname = usePathname() as string | null;
  const active   = isActive(pathname, path);
  const Icon       = ROUTE_ICONS[path] ?? FileText;

  return (
    <Link href={path}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={[
        'group relative flex items-center gap-2.5 rounded-lg mx-2 transition-all duration-150 select-none',
        collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2',
        active
          ? 'bg-white/10 text-white'
          : 'text-white/60 hover:bg-white/[0.06] hover:text-white/90',
      ].join(' ')}
    >
      {/* active bar */}
      {active && (
        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-kred" aria-hidden="true" />
      )}

      <Icon size={16} strokeWidth={active ? 2.2 : 1.8} className="flex-shrink-0" aria-hidden="true" />

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.18 }}
            className="text-[13px] font-medium leading-none overflow-hidden whitespace-nowrap"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}

/* ── NavGroup ───────────────────────────────────────────────────── */
function NavGroup({
  group, collapsed, routes,
}: {
  group: typeof MODULE_GROUPS[0];
  collapsed: boolean;
  routes: { path: string; label: string }[];
}) {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(`sg_${group.id}`);
    return stored !== '0'; // default open
  });

  const toggle = useCallback(() => {
    setOpen(prev => {
      const next = !prev;
      localStorage.setItem(`sg_${group.id}`, next ? '1' : '0');
      return next;
    });
  }, [group.id]);

  if (collapsed) {
    // En modo colapsado muestra las rutas individuales como iconos con tooltip nativo
    return (
      <div className="mb-1">
        {routes.map(r => (
          <NavItem key={r.path} path={r.path} label={r.label} collapsed={true} />
        ))}
      </div>
    );
  }

  const { color: accent } = GROUP_META[group.id] ?? { Icon: LayoutDashboard, color: '#6B7280' };

  return (
    <div className="mb-1">
      {/* Group header */}
      <button
        onClick={toggle}
        aria-expanded={open}
        aria-controls={`nav-group-${group.id}`}
        className="w-full flex items-center gap-2 px-4 py-1.5 mt-2 mb-0.5 cursor-pointer select-none group"
      >
        <span
          className="text-[10px] font-bold tracking-[0.14em] uppercase group-hover:opacity-80 transition-opacity flex-1 text-left"
          style={{ color: open ? accent : 'rgba(255,255,255,0.35)' }}
        >
          {group.label}
        </span>
        <ChevronDown
          size={12}
          aria-hidden="true"
          className={`text-white/25 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </button>

      {/* Routes */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`nav-group-${group.id}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {routes.map(r => (
              <NavItem key={r.path} path={r.path} label={r.label} collapsed={false} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Main Sidebar ───────────────────────────────────────────────── */
export function AppSidebar() {
  const { profile, signOut }      = useAuth();
  const { isCollapsed, toggleCollapsed, isMobileOpen, closeMobile } = useSidebar();
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  function canSee(path: string) {
    const paths = profile?.allowedPaths ?? [];
    if (paths.includes('*')) return true;
    return paths.some(p => p === path || path.startsWith(p + '/'));
  }

  const isAdmin = profile?.role === 'admin';
  const initial = (profile?.full_name ?? 'U')[0].toUpperCase();

  const roleLabel: Record<string, string> = {
    auditor: 'Auditor', 'admin-auditoria': 'Admin Auditoría',
    despachador: 'Despachador', admin: 'Admin',
    'recepcion-tienda': 'Recepción',     'supervisor-picking': 'Sup. Abastecimiento',
    'asistente-despacho': 'Asistente', 'coordinador-flota': 'Coord. Flota',
    supervisor: 'Supervisor',
  };

  const sidebarW = isCollapsed ? 64 : 220;

  const sidebarContent = (
    <motion.aside
      animate={{ width: sidebarW }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col h-full overflow-hidden flex-shrink-0"
      style={{
        background: 'var(--gradient-dark)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* ── Logo ── */}
      <div
        className="flex items-center justify-between px-3 flex-shrink-0"
        style={{ height: 56, borderBottom: '1px solid var(--sidebar-border)' }}
      >
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-baseline gap-[2px] overflow-hidden"
            >
              <span className="font-barlow-condensed text-[22px] font-extrabold text-kred leading-none tracking-tight">
                KIOS
              </span>
              <span className="font-barlow-condensed text-[18px] italic font-bold text-kred leading-none">
                Club
              </span>
              <span className="ml-1.5 text-[9px] font-bold tracking-[0.18em] uppercase text-white/30 leading-none self-end pb-[1px]">
                Coord.
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {isCollapsed && (
          <div className="flex-1 flex justify-center">
            <span className="font-barlow-condensed text-[18px] font-extrabold text-kred leading-none">K</span>
          </div>
        )}

        <button
          onClick={toggleCollapsed}
          aria-label={isCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          aria-expanded={!isCollapsed}
          className="w-7 h-7 rounded-md flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition-all flex-shrink-0"
          title={isCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        >
          {isCollapsed
            ? <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
            : <ChevronLeft  size={14} strokeWidth={2} aria-hidden="true" />
          }
        </button>
      </div>

      {/* ── Inicio ── */}
      <div className="pt-2 px-0">
        <NavItem path="/" label="Inicio" collapsed={isCollapsed} />
      </div>

      {/* ── Command palette trigger ── */}
      <div className="px-2 pb-1">
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
          aria-label="Abrir búsqueda (⌘K)"
          title="Buscar (⌘K)"
          className={[
            'w-full flex items-center rounded-lg transition-all hover:bg-white/[0.06] active:scale-[0.98]',
            isCollapsed ? 'justify-center py-2' : 'gap-2.5 px-3 py-2',
          ].join(' ')}
        >
          <Search size={14} className="text-white/35 flex-shrink-0" strokeWidth={2} />
          <AnimatePresence initial={false}>
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.18 }}
                className="flex-1 flex items-center justify-between overflow-hidden"
              >
                <span className="text-[12px] text-white/30 font-medium whitespace-nowrap">Buscar...</span>
                <kbd className="text-[10px] text-white/20 font-mono bg-white/[0.06] px-1.5 py-0.5 rounded flex-shrink-0">⌘K</kbd>
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* ── Module Groups ── */}
      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto overflow-x-hidden py-1 no-scrollbar">
        {MODULE_GROUPS.map(group => {
          const accessibleRoutes = group.routes.filter(r => canSee(r.path));
          if (!accessibleRoutes.length) return null;
          return (
            <NavGroup
              key={group.id}
              group={group}
              collapsed={isCollapsed}
              routes={accessibleRoutes}
            />
          );
        })}

        {/* Admin section */}
        {isAdmin && (
          <NavGroup
            group={{ id: 'admin', label: 'Admin', color: '#6B7280', routes: [] }}
            collapsed={isCollapsed}
            routes={[
              { path: '/admin/usuarios',          label: 'Usuarios'     },
              { path: '/despacho/config-tiendas', label: 'Config. Despacho' },
            ]}
          />
        )}
      </nav>

      {/* ── Divider ── */}
      <div className="mx-3 my-1" style={{ height: 1, background: 'var(--sidebar-border)' }} />

      {/* ── User footer ── */}
      <div className="flex-shrink-0 p-2 relative">
        <button
          onClick={() => setUserMenuOpen(v => !v)}
          aria-label={`Menú de usuario: ${profile?.full_name ?? 'Usuario'}`}
          aria-expanded={userMenuOpen}
          aria-haspopup="menu"
          className={[
            'w-full flex items-center rounded-lg transition-all hover:bg-white/[0.07] active:scale-[0.98]',
            isCollapsed ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2',
          ].join(' ')}
          title={isCollapsed ? (profile?.full_name ?? 'Usuario') : undefined}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0"
            style={{ background: 'rgba(37,99,235,0.55)' }}
          >
            {initial}
          </div>
          <AnimatePresence initial={false}>
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.18 }}
                className="flex-1 min-w-0 overflow-hidden text-left"
              >
                <div className="text-[13px] font-semibold text-white/85 truncate leading-none">
                  {profile?.full_name ?? 'Usuario'}
                </div>
                <div className="text-[10px] text-white/35 uppercase tracking-wider mt-0.5 leading-none">
                  {roleLabel[profile?.role ?? ''] ?? profile?.role}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </button>

        {/* User dropdown */}
        <AnimatePresence>
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setUserMenuOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full left-2 right-2 mb-1 rounded-xl overflow-hidden z-[70]"
                style={{ background: 'var(--sidebar-dropdown)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
              >
                <button
                  onClick={() => { setUserMenuOpen(false); router.push('/perfil'); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors text-[13px] font-medium text-left"
                >
                  <Settings2 size={14} />
                  Gestionar cuenta
                </button>
                <div className="h-px mx-3" style={{ background: 'rgba(255,255,255,0.07)' }} />
                <button
                  onClick={async () => { setUserMenuOpen(false); await signOut(); router.push('/login'); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 transition-colors text-[13px] font-medium text-left"
                >
                  <LogOut size={14} />
                  Cerrar sesión
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:flex h-full">
        {sidebarContent}
      </div>

      {/* Mobile drawer backdrop */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[55] lg:hidden"
            style={{ background: 'rgba(0,0,0,0.55)' }}
            onClick={closeMobile}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Mobile drawer */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
            initial={{ x: -220 }}
            animate={{ x: 0 }}
            exit={{ x: -220 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed left-0 top-0 bottom-0 z-[56] lg:hidden"
            style={{ width: 220 }}
          >
            {sidebarContent}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
