'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Route, Activity, Users, Settings, ClipboardList, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ProfilePill } from '../../components/ProfilePill';
import { fetchNotificacionesPendientes, subscribeToNotificaciones } from '@/lib/calendarioArmadoSync';

export default function DespachoHubPage() {
  const router = useRouter();
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    fetchNotificacionesPendientes().then(n => setNotifCount(n.length));
    return subscribeToNotificaciones(n => setNotifCount(n.length));
  }, []);

  const tabs: { id: string; label: React.ReactNode; sub: string; border: string; bg: string; shadow: string; onClick: () => void; Icon: LucideIcon; iconColor: string }[] = [
    {
      id: 'conteo', label: <>Conteo/<br />Consolidación</>, sub: 'Nacional · RM/Costa',
      border: 'rgba(6,182,212,0.50)', bg: 'rgba(6,182,212,0.15)', shadow: 'rgba(6,182,212,0.20)',
      onClick: () => router.push('/despacho/conteo'),
      Icon: ClipboardList, iconColor: 'rgba(103,232,249,0.9)',
    },
    {
      id: 'enrutador', label: 'Enrutador', sub: 'Sistema de enrutamiento',
      border: 'rgba(34,197,94,0.50)', bg: 'rgba(34,197,94,0.16)', shadow: 'rgba(34,197,94,0.20)',
      onClick: () => { sessionStorage.setItem('despacho_from', '/despacho-hub'); router.push('/despacho'); },
      Icon: Route, iconColor: 'rgba(110,231,183,0.9)',
    },
    {
      id: 'control-flota', label: 'Control de Flota', sub: 'Conductor · Pionetas · Reasignar',
      border: 'rgba(249,115,22,0.50)', bg: 'rgba(249,115,22,0.13)', shadow: 'rgba(249,115,22,0.18)',
      onClick: () => router.push('/despacho/control-flota'),
      Icon: Truck, iconColor: 'rgba(253,186,116,0.9)',
    },
    {
      id: 'panel-choferes', label: 'Panel Choferes', sub: 'Hub Conductor · Recepción',
      border: 'rgba(168,85,247,0.50)', bg: 'rgba(168,85,247,0.15)', shadow: 'rgba(168,85,247,0.20)',
      onClick: () => router.push('/panel-choferes'),
      Icon: Users, iconColor: 'rgba(216,180,254,0.9)',
    },
    {
      id: 'estado', label: 'Estado / Seguimiento', sub: 'Etiquetas · Guías · QR',
      border: 'rgba(245,158,11,0.50)', bg: 'rgba(245,158,11,0.13)', shadow: 'rgba(245,158,11,0.18)',
      onClick: () => router.push('/despacho/estado'),
      Icon: Activity, iconColor: 'rgba(251,191,36,0.9)',
    },
    {
      id: 'config-tiendas', label: 'Config. Tiendas', sub: 'Gestión y calendario',
      border: 'rgba(99,102,241,0.50)', bg: 'rgba(99,102,241,0.15)', shadow: 'rgba(99,102,241,0.20)',
      onClick: () => router.push('/despacho/config-tiendas'),
      Icon: Settings, iconColor: 'rgba(165,180,252,0.9)',
    },
  ];

  return (
    <>
      <style>{`
        @media (max-width: 480px) {
          .dh-root {
            padding: 0 !important;
            overflow: hidden !important;
            height: 100dvh !important;
            justify-content: flex-start !important;
          }
          .dh-header {
            justify-content: space-between !important;
            margin-bottom: 0 !important;
            padding: 12px 20px !important;
          }
          .dh-mobile-cards {
            flex: 1 !important;
            display: flex !important;
            flex-direction: column !important;
            padding: 12px 16px 20px !important;
            gap: 10px !important;
            min-height: 0;
          }
          .dh-mobile-card {
            flex: 1 !important;
            height: auto !important;
          }
        }
      `}</style>

      <div className="dh-root fixed inset-0 flex flex-col py-10 overflow-y-auto"
           style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

        {/* Header */}
        <div className="dh-header flex items-center gap-3 mb-10 px-6">
          <div className="flex items-center gap-3 flex-1">
            <button
              onClick={() => router.push('/')}
              className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
              style={{
                width: 36, height: 36,
                background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
                border: '1px solid rgba(255,255,255,0.15)',
                boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)',
              }}>
              <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
            </button>
            <div className="font-barlow-condensed text-2xl font-bold text-white tracking-widest uppercase leading-none">Despacho</div>
          </div>
          <ProfilePill />
        </div>

        {/* Desktop grid */}
        <div className="px-6">
          <div className="hidden md:grid md:grid-cols-2 md:gap-3 md:max-w-sm md:mx-auto" style={{ gridAutoRows: '130px' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={t.onClick}
                className="relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2"
                style={{ background: t.bg, borderColor: t.border, boxShadow: `0 8px 24px ${t.shadow}` }}>
                {t.id === 'config-tiendas' && notifCount > 0 && (
                  <div style={{
                    position: 'absolute', top: 8, right: 10,
                    background: '#FF9500', borderRadius: 10,
                    padding: '2px 7px', fontSize: 11, fontWeight: 800, color: '#fff',
                    boxShadow: '0 2px 8px rgba(255,149,0,0.55)',
                    lineHeight: 1.4,
                  }}>{notifCount}</div>
                )}
                <t.Icon size={24} color={t.iconColor} strokeWidth={1.6} style={{ marginBottom: 10 }} />
                <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">{t.label}</div>
                <div className="text-xs text-white/60 mt-1">{t.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Mobile list */}
        <div className="dh-mobile-cards flex md:hidden flex-col gap-3 px-6">
          {tabs.map(t => (
            <button key={t.id} onClick={t.onClick}
              className="dh-mobile-card w-full relative overflow-hidden rounded-2xl flex items-center gap-4 px-5 cursor-pointer transition-all active:scale-95 border-2 text-left"
              style={{
                height: 88,
                background: t.bg,
                borderColor: t.border,
                boxShadow: `0 8px 24px ${t.shadow}`,
              }}>
              {t.id === 'config-tiendas' && notifCount > 0 && (
                <div style={{
                  position: 'absolute', top: 10, right: 14,
                  background: '#FF9500', borderRadius: 10,
                  padding: '2px 8px', fontSize: 11, fontWeight: 800, color: '#fff',
                  boxShadow: '0 2px 8px rgba(255,149,0,0.55)',
                  lineHeight: 1.4,
                }}>{notifCount} pendiente{notifCount !== 1 ? 's' : ''}</div>
              )}
              <t.Icon size={22} color={t.iconColor} strokeWidth={1.6} style={{ flexShrink: 0 }} />
              <div>
                <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">{t.label}</div>
                <div className="text-xs text-white/60 mt-0.5">{t.sub}</div>
              </div>
            </button>
          ))}
        </div>

      </div>
    </>
  );
}
