'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import type { TiendaInfo } from '../data/tiendas';
import type { Vehiculo } from '../data/flota';
import FlotaGrid from './FlotaGrid';

interface Props {
  updateStatus: string;
  tiendas: Record<string, TiendaInfo>;
  onUpdate: () => void;
  onOpenConfig: () => void;
  flotaStatus: string;
  onGuardarFlota: () => void;
  onBack?: () => void;
  onSignOut?: () => void;
  flota: Vehiculo[];
  conductores: string[];
  onToggleFlota: (idx: number) => void;
  onToggleTlbd: (idx: number) => void;
  onConductorChange: (idx: number, nombre: string) => void;
  onAgregarConductor: (nombre: string) => void;
  onAgregarVehiculo: (v: Vehiculo) => void;
}

export default function Header({ updateStatus, tiendas, onUpdate, onOpenConfig, flotaStatus, onGuardarFlota, onBack, onSignOut, flota, conductores, onToggleFlota, onToggleTlbd, onConductorChange, onAgregarConductor, onAgregarVehiculo }: Props) {
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [flotaOpen, setFlotaOpen] = useState(false);
  const total = Object.keys(tiendas).length;

  const updLabel = updateStatus === 'loading' ? 'Actualizando...'
    : updateStatus === 'success' ? `${total} tiendas · OK`
    : updateStatus === 'error'   ? 'Error — reintentar'
    : 'Actualizar datos';

  const saveIcon = flotaStatus === 'saving' ? '···'
    : flotaStatus === 'success' ? '✓'
    : flotaStatus === 'error'   ? '⚠'
    : '💾';

  const saveColor = flotaStatus === 'success' ? '#34C759'
    : flotaStatus === 'error'   ? '#ff3b30'
    : undefined;

  return (
    <header className="bg-white border-b border-black/[0.09] sticky top-0 z-[100] no-print">
      <div className="max-w-[700px] mx-auto flex items-center justify-between h-[60px] px-4">

        <div className="flex items-center gap-2.5">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95"
              aria-label="Volver"
              style={{
                width: 36, height: 36,
                background: 'linear-gradient(145deg, rgba(26,37,80,0.10), rgba(26,37,80,0.05))',
                border: '1px solid rgba(26,37,80,0.15)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.60)',
              }}
            >
              <ChevronLeft size={18} color="rgba(26,37,80,0.75)" strokeWidth={2} />
            </button>
          )}
          <div className="flex flex-col gap-0.5 leading-none">
            <div className="flex items-baseline gap-0.5">
              <span className="text-[20px] font-extrabold text-kred tracking-tight">KIOS</span>
              <span className="text-[17px] italic font-bold text-kred">Club</span>
            </div>
            <div className="bg-knavy rounded-[2px] px-1.5 py-0.5 flex gap-[3px]">
              {[0,1,2,3,4].map(i => <span key={i} className="text-white text-[8px]">★</span>)}
            </div>
          </div>
          <div className="w-px h-[30px] bg-black/[0.09]" />
          <div>
            <div className="text-[10px] font-semibold text-kmuted uppercase tracking-[0.8px]">Centro de Distribución</div>
            <div className="text-[13px] font-bold text-ktext">Sistema de Enrutamiento</div>
          </div>
        </div>

        <button
          onClick={() => setMenuOpen(o => !o)}
          className="w-[36px] h-[36px] rounded-[8px] flex flex-col items-center justify-center gap-[5px] bg-kbg border border-black/[0.1] hover:bg-kred/[0.07] hover:border-kred/[0.2] transition-all"
          aria-label="Menú"
        >
          <span className="w-[16px] h-[1.5px] bg-ktext rounded-full" />
          <span className="w-[16px] h-[1.5px] bg-ktext rounded-full" />
          <span className="w-[16px] h-[1.5px] bg-ktext rounded-full" />
        </button>
      </div>

      {/* ── Hamburger menu ── */}
      {menuOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setMenuOpen(false)} />
          <div className="fixed right-0 top-0 z-[201] w-[min(280px,90vw)] h-full bg-white shadow-[-4px_0_20px_rgba(0,0,0,0.12)] flex flex-col overflow-y-auto">

            {/* Header */}
            <div className="bg-knavy px-4 py-3.5 flex items-center justify-between flex-shrink-0">
              <span className="text-[15px] font-bold text-white tracking-tight">Menú</span>
              <button
                onClick={() => setMenuOpen(false)}
                className="w-[28px] h-[28px] rounded-full bg-white/[0.15] flex items-center justify-center text-[14px] text-white hover:bg-white/[0.25] transition-all"
              >
                ✕
              </button>
            </div>

            <div className="p-3 space-y-1.5">

              {/* Volver */}
              {onBack && (
                <button
                  onClick={() => { onBack(); setMenuOpen(false); }}
                  className="w-full h-[46px] px-3.5 rounded-[10px] bg-kbg border border-black/[0.1] text-ktext text-[13px] font-semibold flex items-center gap-3 transition-all hover:border-kred/[0.3] hover:bg-kred/[0.04] hover:text-kred"
                >
                  <span className="w-[28px] h-[28px] rounded-[7px] bg-black/[0.05] flex items-center justify-center text-[14px] flex-shrink-0">←</span>
                  Volver
                </button>
              )}

              {/* Configurar Calendario */}
              <button
                onClick={() => { onOpenConfig(); setMenuOpen(false); }}
                className="w-full h-[46px] px-3.5 rounded-[10px] bg-kbg border border-black/[0.1] text-ktext text-[13px] font-semibold flex items-center gap-3 transition-all hover:border-kred/[0.3] hover:bg-kred/[0.04] hover:text-kred"
              >
                <span className="w-[28px] h-[28px] rounded-[7px] bg-kred/[0.09] flex items-center justify-center text-[14px] flex-shrink-0">📅</span>
                Configurar Calendario
              </button>

              {/* Flota + Guardar */}
              <div className="flex gap-1.5">
                <button
                  onClick={() => { setMenuOpen(false); setFlotaOpen(true); }}
                  className="flex-1 h-[46px] px-3.5 rounded-[10px] bg-knavy/[0.07] border border-knavy/[0.18] text-knavy text-[13px] font-semibold flex items-center gap-3 transition-all hover:bg-knavy/[0.13]"
                >
                  <span className="w-[28px] h-[28px] rounded-[7px] bg-knavy/[0.12] flex items-center justify-center text-[14px] flex-shrink-0">🚛</span>
                  Flota
                </button>
                <button
                  onClick={onGuardarFlota}
                  disabled={flotaStatus === 'saving'}
                  title="Guardar Flota"
                  style={{ color: saveColor }}
                  className="w-[46px] h-[46px] rounded-[10px] bg-knavy/[0.07] border border-knavy/[0.18] flex items-center justify-center text-[17px] flex-shrink-0 transition-all disabled:opacity-50 hover:bg-knavy/[0.13] text-knavy"
                >
                  {saveIcon}
                </button>
              </div>

              {/* Actualizar datos */}
              <button
                onClick={() => { onUpdate(); setMenuOpen(false); }}
                disabled={updateStatus === 'loading'}
                className={`w-full h-[46px] px-3.5 rounded-[10px] border text-[13px] font-semibold flex items-center gap-3 transition-all disabled:opacity-60
                  ${updateStatus === 'success'
                    ? 'bg-[#34C759]/[0.07] border-[#34C759]/[0.25] text-[#34C759]'
                    : updateStatus === 'error'
                    ? 'bg-kred/[0.07] border-kred/[0.2] text-kred'
                    : 'bg-kred/[0.06] border-kred/[0.15] text-kred hover:bg-kred/[0.11]'}`}
              >
                <span className="w-[28px] h-[28px] rounded-[7px] bg-kred/[0.09] flex items-center justify-center text-[14px] flex-shrink-0">
                  {updateStatus === 'success' ? '✓' : updateStatus === 'error' ? '⚠' : '↻'}
                </span>
                {updLabel}
              </button>

              {/* Cerrar sesión */}
              {onSignOut && (
                <button
                  onClick={() => { setMenuOpen(false); onSignOut(); }}
                  className="w-full h-[46px] px-3.5 rounded-[10px] bg-kbg border border-black/[0.09] text-kmuted text-[13px] font-semibold flex items-center gap-3 transition-all hover:bg-red-50 hover:border-kred/[0.2] hover:text-kred"
                >
                  <span className="w-[28px] h-[28px] rounded-[7px] bg-black/[0.04] flex items-center justify-center text-[14px] flex-shrink-0">↪</span>
                  Cerrar sesión
                </button>
              )}
            </div>
          </div>
        </>,
        document.body
      )}

      {/* ── Panel Flota (overlay completo, igual que Calendario) ── */}
      {flotaOpen && createPortal(
        <>
          <div
            className="fixed inset-0 bg-black/[0.42] z-[900] backdrop-blur-sm"
            onClick={() => setFlotaOpen(false)}
          />
          <div className="fixed top-0 right-0 w-[min(390px,100%)] h-full bg-white z-[901] overflow-y-auto flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.14)]">

            {/* Panel header */}
            <div className="bg-knavy px-[18px] py-[18px] flex items-start justify-between sticky top-0 z-10 flex-shrink-0">
              <div>
                <div className="text-[10px] font-semibold text-white/70 uppercase tracking-[1px]">CONFIGURACIÓN</div>
                <div className="text-[17px] font-bold text-white mt-0.5">🚛 Flota</div>
                <div className="text-[12px] text-white/70 mt-0.5 leading-snug">
                  {flota.filter(v => v.on).length} activos · {flota.length} en total
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onGuardarFlota}
                  disabled={flotaStatus === 'saving'}
                  style={{ color: saveColor }}
                  className="h-[30px] px-3 rounded-[7px] bg-white/[0.18] text-white text-[12px] font-bold flex items-center gap-1.5 hover:bg-white/[0.28] transition-all disabled:opacity-50"
                >
                  <span>{saveIcon}</span>
                  <span>{flotaStatus === 'saving' ? 'Guardando' : flotaStatus === 'success' ? 'Guardado' : flotaStatus === 'error' ? 'Error' : 'Guardar'}</span>
                </button>
                <button
                  onClick={() => setFlotaOpen(false)}
                  className="w-[30px] h-[30px] rounded-[7px] bg-white/[0.18] text-white text-[13px] flex items-center justify-center hover:bg-white/[0.28] transition-all"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* FlotaGrid */}
            <div className="px-3 py-3 flex-1">
              <FlotaGrid
                flota={flota}
                conductores={conductores}
                onToggle={onToggleFlota}
                onToggleTlbd={onToggleTlbd}
                onConductorChange={onConductorChange}
                onAgregarConductor={onAgregarConductor}
                onAgregarVehiculo={onAgregarVehiculo}
              />
            </div>
          </div>
        </>,
        document.body
      )}
    </header>
  );
}
