'use client';

import { useRouter } from 'next/navigation';
import {
  ClipboardCheck, Search, PackageCheck, CheckSquare, Activity, Settings, ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAuth } from '../../components/AuthProvider';

type HubModule = {
  label: string;
  sub: string;
  path: string;
  color: string;
  Icon: LucideIcon;
  onClick: () => void;
};

function ControlInternoContent() {
  const router = useRouter();
  const { profile } = useAuth();

  function canSee(path: string): boolean {
    const paths = profile?.allowedPaths ?? [];
    if (paths.includes('*')) return true;
    return paths.some(p => p === path || path.startsWith(p + '/'));
  }

  const allModules: HubModule[] = [
    {
      label: 'Auditoría',
      sub: 'Control de calidad de pallets',
      path: '/auditoria',
      color: '#D97706',
      Icon: ClipboardCheck,
      onClick: () => router.push('/auditoria'),
    },
    {
      label: 'Revisión Auditoría',
      sub: 'Revisión y seguimiento de auditorías',
      path: '/auditoria-admin',
      color: '#7C3AED',
      Icon: Search,
      onClick: () => router.push('/auditoria-admin'),
    },
    {
      label: 'Recepción / Tienda',
      sub: 'Registro de entrega en tienda',
      path: '/recepcion-tienda',
      color: '#059669',
      Icon: PackageCheck,
      onClick: () => router.push('/recepcion-tienda'),
    },
    {
      label: 'Validación Tienda',
      sub: 'Confirmar entregas recibidas',
      path: '/validacion-tienda',
      color: '#4F46E5',
      Icon: CheckSquare,
      onClick: () => router.push('/validacion-tienda'),
    },
    {
      label: 'Panel Operaciones',
      sub: 'Registro de entregas · Recepción tiendas',
      path: '/panel-operaciones',
      color: '#0891B2',
      Icon: Activity,
      onClick: () => router.push('/panel-operaciones'),
    },
    {
      label: 'Config. Tiendas',
      sub: 'Gestión de tiendas · Calendario central',
      path: '/admin/tiendas',
      color: '#D42B2B',
      Icon: Settings,
      onClick: () => router.push('/admin/tiendas'),
    },
  ].filter(m => canSee(m.path));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PageHeader title="Control Interno" subtitle="Módulos de control y auditoría" backHref="/" />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl">
          {allModules.map(m => (
            <button
              key={m.path}
              onClick={m.onClick}
              className="group relative bg-card rounded-card border border-border/60 p-4 text-left transition-all hover:shadow-card2 hover:-translate-y-0.5 active:scale-[0.99]"
              style={{ borderLeftWidth: 3, borderLeftColor: m.color }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                style={{ background: `${m.color}18` }}
              >
                <m.Icon size={18} strokeWidth={1.8} style={{ color: m.color }} />
              </div>

              <div className="font-barlow-condensed text-[17px] font-bold text-text uppercase tracking-wide leading-tight pr-4">
                {m.label}
              </div>
              <div className="text-[12px] text-text-3 mt-1 leading-snug">{m.sub}</div>

              <ChevronRight
                size={14}
                className="absolute bottom-4 right-4 text-text-3 group-hover:text-text-2 transition-colors"
                strokeWidth={2}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ControlInternoPage() {
  return (
    <ErrorBoundary module="Control Interno">
      <ControlInternoContent />
    </ErrorBoundary>
  );
}
