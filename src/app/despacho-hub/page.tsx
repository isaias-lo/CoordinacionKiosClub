'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Route, Activity, Users, Settings, ClipboardList, Truck, ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAuth } from '@/components/AuthProvider';
import { fetchNotificacionesPendientes, subscribeToNotificaciones } from '@/lib/calendarioArmadoSync';

type HubModule = {
  id: string;
  path: string;
  label: string;
  sub: string;
  color: string;
  Icon: LucideIcon;
  onClick: () => void;
};

function DespachoHubContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    fetchNotificacionesPendientes().then(n => setNotifCount(n.length));
    return subscribeToNotificaciones(n => setNotifCount(n.length));
  }, []);

  function canSee(path: string): boolean {
    const paths = profile?.allowedPaths ?? [];
    if (paths.includes('*')) return true;
    return paths.includes(path);
  }

  const allModules: HubModule[] = [
    {
      id: 'conteo',
      path: '/despacho/conteo',
      label: 'Conteo / Consolidación',
      sub: 'Nacional · RM / Costa',
      color: '#0891B2',
      Icon: ClipboardList,
      onClick: () => router.push('/despacho/conteo'),
    },
    {
      id: 'enrutador',
      path: '/despacho',
      label: 'Enrutador',
      sub: 'Sistema de enrutamiento de despacho',
      color: '#16A34A',
      Icon: Route,
      onClick: () => { sessionStorage.setItem('despacho_from', '/despacho-hub'); router.push('/despacho'); },
    },
    {
      id: 'control-flota',
      path: '/despacho/control-flota',
      label: 'Control de Flota',
      sub: 'Conductor · Pionetas · Reasignación',
      color: '#EA580C',
      Icon: Truck,
      onClick: () => router.push('/despacho/control-flota'),
    },
    {
      id: 'panel-choferes',
      path: '/panel-choferes',
      label: 'Panel Choferes',
      sub: 'Hub Conductor · Recepción en ruta',
      color: '#7C3AED',
      Icon: Users,
      onClick: () => router.push('/panel-choferes'),
    },
    {
      id: 'estado',
      path: '/despacho/estado',
      label: 'Estado / Seguimiento',
      sub: 'Etiquetas · Guías · Escáner QR',
      color: '#D97706',
      Icon: Activity,
      onClick: () => router.push('/despacho/estado'),
    },
    {
      id: 'config-tiendas',
      path: '/despacho/config-tiendas',
      label: 'Config. Tiendas',
      sub: 'Gestión de tiendas y calendario',
      color: '#4F46E5',
      Icon: Settings,
      onClick: () => router.push('/despacho/config-tiendas'),
    },
  ];

  const modules = profile ? allModules.filter(m => canSee(m.path)) : allModules;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PageHeader title="Despacho" subtitle="Módulos del sistema de despacho" backHref="/" />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl">
          {modules.map(m => (
            <button
              key={m.id}
              onClick={m.onClick}
              className="group relative bg-card rounded-card border border-border/60 p-4 text-left transition-all hover:shadow-card2 hover:-translate-y-0.5 active:scale-[0.99]"
              style={{ borderLeftWidth: 3, borderLeftColor: m.color }}
            >
              {m.id === 'config-tiendas' && notifCount > 0 && (
                <span
                  className="absolute top-3 right-3 text-[11px] font-bold text-white px-2 py-0.5 rounded-full"
                  style={{ background: '#FF9500' }}
                >
                  {notifCount}
                </span>
              )}

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

export default function DespachoHubPage() {
  return (
    <ErrorBoundary module="Despacho Hub">
      <DespachoHubContent />
    </ErrorBoundary>
  );
}
