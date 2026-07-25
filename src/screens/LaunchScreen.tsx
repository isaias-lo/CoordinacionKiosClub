'use client';

import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import { supabase } from '../lib/supabase';
import { KpiCard } from '../components/KpiCard';
import { EmptyState } from '../components/ui/empty-state';
import { StatusBadge } from '../components/ui/status-badge';
import { useHistorial, useHistorialStats, HistorialEntry } from '../hooks/queries/useHistorial';
import { useTodayPickingPallets } from '../hooks/queries/usePickingPallets';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Truck, ClipboardList, Layers, Store, ClipboardCheck, Shield,
  TrendingUp, Package, ArrowRight, Bell,
} from 'lucide-react';
import { FEATURE_COLORS, featureBg } from '../config/features';
const DispatchChartLazy = lazy(() => import('../components/charts/DispatchChart'));

/* ── Types ──────────────────────────────────────────────────────── */
interface QuickTile {
  key: string; path: string; label: string; sub: string;
  Icon: React.ElementType; color: string; bg: string;
}

/* ── Role helpers ────────────────────────────────────────────────── */
const ROLE_LABEL: Record<string, string> = {
  auditor: 'Auditor', 'admin-auditoria': 'Admin Auditoría',
  despachador: 'Despachador', admin: 'Administrador',
  'supervisor-picking': 'Sup. Abastecimiento',
  'asistente-despacho': 'Asistente', 'coordinador-flota': 'Coord. Flota',
  supervisor: 'Supervisor',
};

/* ── Greeting ────────────────────────────────────────────────────── */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/* ── Dispatch chart types ────────────────────────────────────────── */
interface ChartData { day: string; fullDate: string; pallets: number; bultos: number; contenedores: number; chocolates: number }

/* ── Main Dashboard ──────────────────────────────────────────────── */
export function LaunchScreen() {
  const router  = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  const isAdmin          = profile?.role === 'admin';
  const isSupervisorPick = profile?.role === 'supervisor-picking';

  /* React Query hooks */
  const { stats, isLoading: statsLoading } = useHistorialStats();
  const { data: pallets = [], isLoading: palletsLoading } = useTodayPickingPallets();

  function canSee(path: string): boolean {
    const paths = profile?.allowedPaths ?? [];
    if (paths.includes('*')) return true;
    return paths.some(p => p === path || path.startsWith(p + '/'));
  }

  /* Pending approval count (admin only) */
  const loadPending = useCallback(async () => {
    if (!isAdmin) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/admin/users?count=pending', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json() as { pendingCount?: number };
    if (typeof data.pendingCount === 'number') {
      setPendingCount(data.pendingCount);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadPending();
    // 5 min: the approval badge doesn't need 30 s freshness, and each poll pulls the full
    // user list out of Supabase Auth (egress). 10× fewer polls per open admin tab.
    const t = setInterval(loadPending, 300_000);
    return () => clearInterval(t);
  }, [loadPending]);

  /* Chart data — últimos 7 días CON despacho (no días de calendario vacíos),
     así el gráfico siempre muestra actividad real aunque los despachos sean esporádicos. */
  const { data: historialRaw = [] } = useHistorial(90);

  const chartData: ChartData[] = (historialRaw as HistorialEntry[])
    .filter(r => ((r.total_pallets ?? 0) + (r.total_bultos ?? 0) + (r.total_contenedores ?? 0) + (r.total_chocolates ?? 0)) > 0)
    .slice(0, 7)   // historialRaw viene ordenado por fecha desc (más reciente primero)
    .reverse()     // cronológico para el gráfico
    .map(r => {
      const d = parseISO(r.date);
      return {
        day:          format(d, 'd MMM', { locale: es }).replace('.', ''),
        fullDate:     format(d, "EEEE d 'de' MMMM", { locale: es }),
        pallets:      r.total_pallets      ?? 0,
        bultos:       r.total_bultos       ?? 0,
        contenedores: r.total_contenedores ?? 0,
        chocolates:   r.total_chocolates   ?? 0,
      };
    });

  /* Quick tiles */
  const hasControlInterno = canSee('/control-interno');

  const potentialTiles: (QuickTile | null)[] = [
    canSee('/despacho') ? {
      key: 'despacho', path: '/despacho', label: 'Despacho', sub: 'Enrutador · Flota · Estado',
      Icon: Truck, color: FEATURE_COLORS.despacho, bg: featureBg('despacho'),
    } : null,
    // Solo mostrar si el usuario tiene acceso directo (sin hub intermedio)
    canSee('/despacho/regiones') ? {
      key: 'nacional', path: '/despacho/regiones', label: 'Nacional', sub: 'Regiones',
      Icon: Store, color: FEATURE_COLORS.nacional, bg: featureBg('nacional'),
    } : null,
    canSee('/despacho/santiago') ? {
      key: 'rm', path: '/despacho/santiago', label: 'RM / Costa', sub: 'Santiago',
      Icon: ClipboardList, color: FEATURE_COLORS.rmCosta, bg: featureBg('rmCosta'),
    } : null,
    canSee('/auditoria') ? {
      key: 'auditoria', path: '/auditoria', label: 'Auditoría', sub: 'Bodega · Control',
      Icon: ClipboardCheck, color: FEATURE_COLORS.auditoria, bg: featureBg('auditoria'),
    } : null,
    canSee('/picking') ? {
      key: 'picking', path: '/picking', label: 'Abastecimiento', sub: 'Supervisión',
      Icon: Layers, color: FEATURE_COLORS.picking, bg: featureBg('picking'),
    } : null,
    hasControlInterno ? {
      key: 'ci', path: '/control-interno', label: 'Control Interno', sub: 'Tiendas · Recepción',
      Icon: Shield, color: FEATURE_COLORS.controlInterno, bg: featureBg('controlInterno'),
    } : null,
    // Solo mostrar Operaciones si el usuario no tiene el hub de Control Interno
    !hasControlInterno && canSee('/panel-operaciones') ? {
      key: 'ops', path: '/panel-operaciones', label: 'Operaciones', sub: 'Panel central',
      Icon: TrendingUp, color: FEATURE_COLORS.operaciones, bg: featureBg('operaciones'),
    } : null,
  ];
  const allTiles = authLoading ? [] : potentialTiles.filter(Boolean) as QuickTile[];

  /* Picking quick stats */
  const pickingPendiente  = pallets.filter(p => !p.picker_label).length;
  const pickingCompletado = pallets.filter(p => !!p.picker_label).length;

  const todayFull = format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es });
  const firstName = (profile?.full_name ?? 'Usuario').split(' ')[0];

  /* Role-specific overrides */
  if (isSupervisorPick) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-5 bg-kbg">
        <button
          onClick={() => router.push('/picking')}
          className="flex flex-col items-center gap-3 p-8 bg-card rounded-kios shadow-card2 border border-border/60 hover:shadow-kios transition-all active:scale-[0.98] min-w-[220px]"
        >
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.12)' }}>
            <Layers size={28} style={{ color: '#F59E0B' }} strokeWidth={1.6} />
          </div>
          <div className="text-center">
            <div className="font-barlow-condensed text-lg font-bold text-text uppercase tracking-wide">Abastecimiento</div>
            <div className="text-[12px] text-text-3 mt-0.5">Supervisión de operaciones</div>
          </div>
          <ArrowRight size={16} className="text-text-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-y-auto bg-kbg">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Header greeting ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-barlow-condensed text-[26px] font-bold text-text leading-none">
              {greeting()}, {firstName}
            </h1>
            <p className="text-[13px] text-text-3 mt-1 capitalize">{todayFull}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isAdmin && pendingCount > 0 && (
              <button
                onClick={() => router.push('/admin/usuarios')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-semibold text-white transition-all"
                style={{ background: '#D97706' }}
              >
                <Bell size={12} strokeWidth={2.5} />
                {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
              </button>
            )}
            <div
              className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full text-white"
              style={{ background: '#1B2A6B' }}
            >
              {ROLE_LABEL[profile?.role ?? ''] ?? profile?.role ?? 'Usuario'}
            </div>
          </div>
        </div>

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="Días despachados"
            value={stats.dias}
            icon={Truck}
            color={FEATURE_COLORS.admin}
            loading={statsLoading}
          />
          <KpiCard
            label="Pallets totales"
            value={stats.pallets}
            icon={Package}
            color={FEATURE_COLORS.despacho}
            loading={statsLoading}
          />
          <KpiCard
            label="Bultos totales"
            value={stats.bultos}
            icon={ClipboardList}
            color={FEATURE_COLORS.rmCosta}
            loading={statsLoading}
          />
          <KpiCard
            label="Abastecimiento hoy"
            value={pallets.length}
            icon={Layers}
            color={FEATURE_COLORS.picking}
            loading={palletsLoading}
            onClick={canSee('/picking') ? () => router.push('/picking') : undefined}
          />
        </div>

        {/* ── Chart + Abastecimiento status ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Dispatch chart */}
          <div className="md:col-span-2 bg-card rounded-card shadow-card border border-border/60 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-barlow-condensed font-bold text-[15px] uppercase tracking-wide text-text">
                  Despachos recientes
                </h2>
                <p className="text-[11px] text-text-3 mt-0.5">Últimos 7 días con despacho</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-text-3 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#1B2A6B' }} />
                  Pallets
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block opacity-70" style={{ background: '#3B82F6' }} />
                  Bultos
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#D97706' }} />
                  Contenedores
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#9333EA' }} />
                  Chocolates
                </span>
              </div>
            </div>
            <div style={{ height: 180 }}>
              <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-5 h-5 rounded-full border-2 border-knavy/30 border-t-knavy animate-spin" /></div>}>
                <DispatchChartLazy data={chartData} loading={statsLoading} />
              </Suspense>
            </div>
          </div>

          {/* Abastecimiento status */}
          <div className="bg-card rounded-card shadow-card border border-border/60 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-barlow-condensed font-bold text-[15px] uppercase tracking-wide text-text">
                Abastecimiento hoy
              </h2>
              {canSee('/picking') && (
                <button
                  onClick={() => router.push('/picking')}
                  className="text-[11px] text-knavy font-semibold hover:underline flex items-center gap-1"
                >
                  Ver todo <ArrowRight size={10} />
                </button>
              )}
            </div>

            {palletsLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-8 bg-border/40 rounded-lg animate-pulse" />)}
              </div>
            ) : pallets.length === 0 ? (
              <EmptyState
                icon={Layers}
                title="Sin pallets hoy"
                description="No hay operaciones de picking registradas."
                variant="inline"
              />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-kbg">
                  <span className="text-[13px] font-medium text-text-2">Total</span>
                  <span className="font-barlow-condensed text-[20px] font-bold text-text">{pallets.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-kbg">
                  <StatusBadge status="pendiente" size="sm" label="Pendientes" />
                  <span className="font-bold text-[16px] text-text">{pickingPendiente}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-kbg">
                  <StatusBadge status="completado" size="sm" label="Asignados" />
                  <span className="font-bold text-[16px] text-text">{pickingCompletado}</span>
                </div>
                {pallets.length > 0 && (
                  <div className="mt-1">
                    <div className="h-2 bg-border/50 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${(pickingCompletado / pallets.length) * 100}%`, background: '#34C759' }}
                      />
                    </div>
                    <p className="text-[10px] text-text-3 mt-1 text-right">
                      {Math.round((pickingCompletado / pallets.length) * 100)}% completado
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Quick access tiles ── */}
        <div>
          <h2 className="font-barlow-condensed font-bold text-[13px] uppercase tracking-widest text-text-3 mb-3">
            Acceso rápido
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {authLoading
              ? Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3 p-4 bg-card rounded-card border border-border/60">
                    <div className="w-9 h-9 rounded-xl bg-border/40 animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-border/40 rounded animate-pulse w-3/4" />
                      <div className="h-2.5 bg-border/30 rounded animate-pulse w-1/2" />
                    </div>
                  </div>
                ))
              : allTiles.map(t => (
                  <button
                    key={t.key}
                    onClick={() => router.push(t.path)}
                    className="flex items-center gap-3 p-4 bg-card rounded-card shadow-card border border-border/60 hover:shadow-card2 hover:border-border transition-all active:scale-[0.97] text-left group"
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{ background: t.bg }}
                    >
                      <t.Icon size={16} strokeWidth={1.8} style={{ color: t.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-text truncate leading-tight group-hover:text-knavy transition-colors">
                        {t.label}
                      </div>
                      <div className="text-[11px] text-text-3 truncate leading-tight mt-0.5">{t.sub}</div>
                    </div>
                    <ArrowRight size={12} className="text-text-3 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                  </button>
                ))
            }
          </div>
        </div>

      </div>
    </div>
  );
}
