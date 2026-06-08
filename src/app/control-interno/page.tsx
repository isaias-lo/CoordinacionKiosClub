'use client';

import { useRouter } from 'next/navigation';
import {
  ClipboardCheck, Search, PackageCheck, CheckSquare, Activity, Settings,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { HubPage, type HubModuleEntry } from '@/components/layout/HubPage';
import { useAuth } from '../../components/AuthProvider';
import { FEATURE_COLORS } from '@/config/features';

function ControlInternoContent() {
  const router = useRouter();
  const { profile } = useAuth();

  function canSee(path: string): boolean {
    const paths = profile?.allowedPaths ?? [];
    if (paths.includes('*')) return true;
    return paths.some(p => p === path || path.startsWith(p + '/'));
  }

  const allModules: HubModuleEntry[] = [
    {
      id: 'auditoria',
      label: 'Auditoría',
      sub: 'Control de calidad de pallets',
      path: '/auditoria',
      color: FEATURE_COLORS.auditoria,
      Icon: ClipboardCheck,
      onClick: () => router.push('/auditoria'),
    },
    {
      id: 'auditoria-admin',
      label: 'Revisión Auditoría',
      sub: 'Revisión y seguimiento de auditorías',
      path: '/auditoria-admin',
      color: FEATURE_COLORS.auditoriaAdmin,
      Icon: Search,
      onClick: () => router.push('/auditoria-admin'),
    },
    {
      id: 'recepcion-tienda',
      label: 'Recepción / Tienda',
      sub: 'Registro de entrega en tienda',
      path: '/recepcion-tienda',
      color: FEATURE_COLORS.recepcion,
      Icon: PackageCheck,
      onClick: () => router.push('/recepcion-tienda'),
    },
    {
      id: 'validacion-tienda',
      label: 'Validación Tienda',
      sub: 'Confirmar entregas recibidas',
      path: '/validacion-tienda',
      color: FEATURE_COLORS.validacion,
      Icon: CheckSquare,
      onClick: () => router.push('/validacion-tienda'),
    },
    {
      id: 'panel-operaciones',
      label: 'Panel Operaciones',
      sub: 'Registro de entregas · Recepción tiendas',
      path: '/panel-operaciones',
      color: FEATURE_COLORS.operaciones,
      Icon: Activity,
      onClick: () => router.push('/panel-operaciones'),
    },
    {
      id: 'config-tiendas',
      label: 'Config. Tiendas',
      sub: 'Gestión de tiendas · Calendario central',
      path: '/admin/tiendas',
      color: FEATURE_COLORS.configTiendas,
      Icon: Settings,
      onClick: () => router.push('/admin/tiendas'),
    },
  ];

  const loading = profile === null;
  const modules = loading ? [] : allModules.filter(m => canSee(m.path));

  return (
    <HubPage
      title="Control Interno"
      subtitle="Módulos de control y auditoría"
      backHref="/"
      modules={modules}
      loading={loading}
    />
  );
}

export default function ControlInternoPage() {
  return (
    <ErrorBoundary module="Control Interno">
      <ControlInternoContent />
    </ErrorBoundary>
  );
}
