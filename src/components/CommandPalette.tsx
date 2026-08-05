'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, LayoutDashboard, Truck, ClipboardCheck, PackageCheck,
  Shield, Map, Globe, MapPin, BarChart3, Activity, Monitor, Store,
  FileText, AlertTriangle, CheckSquare, Settings2,
  Users, CalendarDays, LogOut, RefreshCw, Navigation as NavIcon,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { MODULE_GROUPS } from '@/config/routes';

/* ── Icon registry ─────────────────────────────────────────────── */
const ROUTE_ICONS: Record<string, React.ElementType> = {
  '/':                        LayoutDashboard,
  '/despacho':                Map,
  '/despacho/regiones':       Globe,
  '/despacho/santiago':       MapPin,
  '/despacho/conteo':         BarChart3,
  '/despacho/control-flota':  Truck,
  '/despacho/estado':         Activity,
  '/conductor-hub':           NavIcon,
  '/panel-operaciones':       Monitor,
  '/tiendas':                 Store,
  '/registros':               FileText,
  '/incidencias':             AlertTriangle,
  '/control-interno':         Shield,
  '/validacion-tienda':       CheckSquare,
  '/admin/tiendas':           Settings2,
  '/admin/usuarios':          Users,
  '/admin/calendario':        CalendarDays,
  '/auditoria':               ClipboardCheck,
  '/auditoria-admin':         ClipboardCheck,
  '/picking':                 PackageCheck,
};

const RECENT_KEY = 'cmd_recent_pages';
const MAX_RECENT = 5;

function getRecent(): { path: string; label: string }[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; }
}

function pushRecent(path: string, label: string) {
  const items = getRecent().filter(r => r.path !== path);
  items.unshift({ path, label });
  localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT)));
}

/* ── Hook: global ⌘K listener ──────────────────────────────────── */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return { open, setOpen };
}

/* ── CommandItem ────────────────────────────────────────────────── */
function CmdItem({
  icon: Icon, label, subtitle, shortcut, onSelect,
}: {
  icon?: React.ElementType;
  label: string;
  subtitle?: string;
  shortcut?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors select-none outline-none data-[selected=true]:bg-knavy/10 data-[selected=true]:text-knavy group"
    >
      {Icon && (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-border/70 group-data-[selected=true]:bg-knavy/15 transition-colors">
          <Icon size={14} className="text-text-3 group-data-[selected=true]:text-knavy" strokeWidth={1.8} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-text leading-none truncate">{label}</div>
        {subtitle && <div className="text-[11px] text-text-3 mt-0.5 leading-none truncate">{subtitle}</div>}
      </div>
      {shortcut && (
        <kbd className="text-[10px] text-text-3 bg-border/60 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
          {shortcut}
        </kbd>
      )}
    </Command.Item>
  );
}

/* ── Main Component ─────────────────────────────────────────────── */
export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const [recent, setRecent] = useState<{ path: string; label: string }[]>([]);

  // Load recents on open
  useEffect(() => {
    if (open) setRecent(getRecent());
  }, [open]);

  function navigate(path: string, label: string) {
    pushRecent(path, label);
    setOpen(false);
    router.push(path);
  }

  function canSee(path: string) {
    const paths = profile?.allowedPaths ?? [];
    if (paths.includes('*')) return true;
    return paths.some(p => p === path || path.startsWith(p + '/'));
  }

  const allRoutes = [
    { path: '/', label: 'Inicio' },
    // Excluir rutas ocultas (ej. /despacho/estado, que redirige a /registros) para no duplicar.
    ...MODULE_GROUPS.flatMap(g => g.routes).filter(r => !r.hidden),
    ...(profile?.role === 'admin' ? [
      { path: '/admin/usuarios',   label: 'Usuarios' },
      { path: '/admin/calendario', label: 'Calendario' },
    ] : []),
  ].filter(r => canSee(r.path));

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200]"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
            onClick={() => setOpen(false)}
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -12 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="fixed z-[201] left-1/2 -translate-x-1/2"
            style={{ top: 80, width: '100%', maxWidth: 580, padding: '0 16px' }}
          >
            <div
              className="rounded-2xl overflow-hidden bg-card"
              style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.15)', border: '1px solid rgba(0,0,0,0.08)' }}
            >
              <Command
                className="w-full"
                onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
              >
                {/* Search input */}
                <div
                  className="flex items-center gap-3 px-4"
                  style={{ borderBottom: '1px solid #E8E8ED', height: 52 }}
                >
                  <Search size={16} className="text-text-3 flex-shrink-0" strokeWidth={2} />
                  <Command.Input
                    autoFocus
                    placeholder="Buscar o ir a..."
                    className="flex-1 bg-transparent outline-none text-[14px] text-text placeholder:text-text-3 font-medium"
                  />
                  <kbd className="text-[10px] text-text-3 bg-border/60 px-1.5 py-1 rounded font-mono flex-shrink-0">
                    ESC
                  </kbd>
                </div>

                {/* List */}
                <Command.List
                  className="overflow-y-auto p-2"
                  style={{ maxHeight: 420 }}
                >
                  <Command.Empty className="py-10 text-center text-[13px] text-text-3">
                    Sin resultados para esa búsqueda.
                  </Command.Empty>

                  {/* Recent pages */}
                  {recent.length > 0 && (
                    <Command.Group
                      heading="Recientes"
                      className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-text-3 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:mb-0.5"
                    >
                      {recent.map(r => {
                        const Icon = ROUTE_ICONS[r.path] ?? FileText;
                        return (
                          <CmdItem
                            key={r.path}
                            icon={Icon}
                            label={r.label}
                            subtitle={r.path}
                            onSelect={() => navigate(r.path, r.label)}
                          />
                        );
                      })}
                    </Command.Group>
                  )}

                  {/* Navigation */}
                  <Command.Group
                    heading="Navegación"
                    className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-text-3 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:mt-1"
                  >
                    {allRoutes.map(r => {
                      const Icon = ROUTE_ICONS[r.path] ?? FileText;
                      return (
                        <CmdItem
                          key={r.path}
                          icon={Icon}
                          label={r.label}
                          subtitle={r.path}
                          onSelect={() => navigate(r.path, r.label)}
                        />
                      );
                    })}
                  </Command.Group>

                  {/* Actions */}
                  <Command.Group
                    heading="Acciones"
                    className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-text-3 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:mt-1"
                  >
                    <CmdItem
                      icon={Settings2}
                      label="Gestionar cuenta"
                      onSelect={() => navigate('/perfil', 'Perfil')}
                    />
                    <CmdItem
                      icon={RefreshCw}
                      label="Recargar página"
                      onSelect={() => { setOpen(false); window.location.reload(); }}
                    />
                    <CmdItem
                      icon={LogOut}
                      label="Cerrar sesión"
                      onSelect={async () => { setOpen(false); await signOut(); router.push('/login'); }}
                    />
                  </Command.Group>
                </Command.List>

                {/* Footer */}
                <div
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{ borderTop: '1px solid #E8E8ED' }}
                >
                  <span className="text-[11px] text-text-3 flex items-center gap-1">
                    <kbd className="bg-border/60 px-1 rounded text-[10px]">↑↓</kbd> navegar
                  </span>
                  <span className="text-[11px] text-text-3 flex items-center gap-1">
                    <kbd className="bg-border/60 px-1 rounded text-[10px]">↵</kbd> abrir
                  </span>
                  <span className="text-[11px] text-text-3 flex items-center gap-1 ml-auto">
                    <kbd className="bg-border/60 px-1 rounded text-[10px]">⌘K</kbd> alternar
                  </span>
                </div>
              </Command>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
