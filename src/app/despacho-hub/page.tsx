'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Route, Activity, Users, Settings, ClipboardList, Truck,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { HubPage, type HubModuleEntry } from '@/components/layout/HubPage';
import { useAuth } from '@/components/AuthProvider';
import { fetchNotificacionesPendientes, subscribeToNotificaciones } from '@/lib/calendarioArmadoSync';
import { useTodayPickingPallets } from '@/hooks/queries/usePickingPallets';
import { FEATURE_COLORS } from '@/config/features';

function DespachoHubContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const [notifCount, setNotifCount] = useState(0);
  const { data: pallets = [] } = useTodayPickingPallets();

  const pendientes = pallets.filter(p => !p.picker_label).length;
  const totalPallets = pallets.length;

  useEffect(() => {
    fetchNotificacionesPendientes().then(n => setNotifCount(n.length));
    return subscribeToNotificaciones(n => setNotifCount(n.length));
  }, []);

  function canSee(path: string): boolean {
    const paths = profile?.allowedPaths ?? [];
    if (paths.includes('*')) return true;
    return paths.includes(path);
  }

  const allModules: HubModuleEntry[] = [
    {
      id: 'conteo',
      path: '/despacho/conteo',
      label: 'Conteo / Consolidación',
      sub: 'Nacional · RM / Costa',
      color: FEATURE_COLORS.conteo,
      Icon: ClipboardList,
      status: totalPallets > 0 ? `${totalPallets} pallets hoy` : undefined,
      onClick: () => router.push('/despacho/conteo'),
    },
    {
      id: 'enrutador',
      path: '/despacho',
      label: 'Enrutador',
      sub: 'Sistema de enrutamiento de despacho',
      color: FEATURE_COLORS.enrutador,
      Icon: Route,
      onClick: () => {
        sessionStorage.setItem('despacho_from', '/despacho-hub');
        router.push('/despacho');
      },
    },
    {
      id: 'control-flota',
      path: '/despacho/control-flota',
      label: 'Control de Flota',
      sub: 'Conductor · Pionetas · Reasignación',
      color: FEATURE_COLORS.flota,
      Icon: Truck,
      onClick: () => router.push('/despacho/control-flota'),
    },
    {
      id: 'panel-choferes',
      path: '/panel-choferes',
      label: 'Panel Choferes',
      sub: 'Hub Conductor · Recepción en ruta',
      color: FEATURE_COLORS.choferes,
      Icon: Users,
      onClick: () => router.push('/panel-choferes'),
    },
    {
      id: 'estado',
      path: '/despacho/estado',
      label: 'Estado / Seguimiento',
      sub: 'Etiquetas · Guías · Escáner QR',
      color: FEATURE_COLORS.estado,
      Icon: Activity,
      status: pendientes > 0 ? `${pendientes} sin asignar` : undefined,
      onClick: () => router.push('/despacho/estado'),
    },
    {
      id: 'config-tiendas',
      path: '/despacho/config-tiendas',
      label: 'Config. Tiendas',
      sub: 'Gestión de tiendas y calendario',
      color: FEATURE_COLORS.config,
      Icon: Settings,
      badge: notifCount,
      onClick: () => router.push('/despacho/config-tiendas'),
    },
  ];

  const loading = profile === null;
  const modules = loading ? [] : allModules.filter(m => canSee(m.path));

  return (
    <HubPage
      title="Despacho"
      subtitle="Módulos del sistema de despacho"
      backHref="/"
      modules={modules}
      loading={loading}
    />
  );
}

export default function DespachoHubPage() {
  return (
    <ErrorBoundary module="Despacho Hub">
      <DespachoHubContent />
    </ErrorBoundary>
  );
}
