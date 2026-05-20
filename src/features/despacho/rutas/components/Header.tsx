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
  onEliminarVehiculo: (idx: number) => void;
}

/* ── Icon 3D container ─────────────────────────────────────────── */
function Icon3D({ emoji, from, to, shadow }: { emoji: string; from: string; to: string; shadow: string }) {
  return (
    <span
      style={{
        background: `linear-gradient(145deg, ${from}, ${to})`,
        boxShadow: `0 3px 8px ${shadow}, inset 0 1px 0 rgba(255,255,255,0.22)`,
      }}
      className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center text-[19px] flex-shrink-0 select-none"
    >
      {emoji}
    </span>
  );
}

/* ── Generic menu button ───────────────────────────────────────── */
function MenuItem({ children, onClick, disabled = false }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 1px 1px rgba(0,0,0,0.04)' }}
      className="w-full h-[54px] px-3.5 rounded-[13px] bg-white border border-black/[0.07] flex items-center gap-3 transition-all active:scale-[0.98] hover:bg-kbg disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export default function Header({ updateStatus, tiendas, onUpdate, onOpenConfig, flotaStatus, onGuardarFlota, onBack, onSignOut, flota, conductores, onToggleFlota, onToggleTlbd, onConductorChange, onAgregarConductor, onAgregarVehiculo, onEliminarVehiculo }: Props) {
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [flotaOpen, setFlotaOpen] = useState(false);
  const total = Object.keys(tiendas).length;

  const updLabel = updateStatus === 'loading' ? 'Actualizando...'
    : updateStatus === 'success' ? `${total} tiendas · OK`
    : updateStatus === 'error'   ? 'Error — reintentar'
    : 'Actualizar datos';

  const saveIcon = flotaStatus === 'saving' ? '⏳'
    : flotaStatus === 'success' ? '✓'
    : flotaStatus === 'error'   ? '⚠️'
    : '💾';

  const activosCount = flota.filter(v => v.on).length;

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

      {/* ── Hamburger menu ─────────────────────────────────────────── */}
      {menuOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setMenuOpen(false)} />
          <div className="fixed right-0 top-0 z-[201] w-[min(300px,92vw)] lg:w-[400px] h-full bg-[#F2F2F7] flex flex-col overflow-y-auto">

            {/* Header panel */}
            <div
              style={{ background: 'linear-gradient(160deg, #1B2A6B 0%, #2D3FA0 100%)' }}
              className="px-5 pt-5 pb-6 flex-shrink-0"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] font-semibold text-white/60 uppercase tracking-[1.2px] mb-1">Sistema de Enrutamiento</div>
                  <div className="text-[20px] font-extrabold text-white tracking-tight">Menú</div>
                </div>
                <button
                  onClick={() => setMenuOpen(false)}
                  style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}
                  className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[13px] text-white hover:bg-white/25 transition-all"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Menu items */}
            <div className="p-4 space-y-2.5 flex-1">

              {/* ── Volver ── */}
              {onBack && (
                <MenuItem onClick={() => { onBack(); setMenuOpen(false); }}>
                  <Icon3D emoji="←" from="#8E8E93" to="#636366" shadow="rgba(99,99,102,0.35)" />
                  <div className="flex-1 text-left">
                    <div className="text-[14px] font-semibold text-ktext">Volver</div>
                  </div>
                  <span className="text-[16px] text-black/20 font-light">›</span>
                </MenuItem>
              )}

              {/* ── Configurar Calendario ── */}
              <MenuItem onClick={() => { onOpenConfig(); setMenuOpen(false); }}>
                <Icon3D emoji="📅" from="#FF5252" to="#C42020" shadow="rgba(196,32,32,0.4)" />
                <div className="flex-1 text-left">
                  <div className="text-[14px] font-semibold text-ktext">Calendario</div>
                  <div className="text-[11px] text-kmuted">Configurar despacho</div>
                </div>
                <span className="text-[16px] text-black/20 font-light">›</span>
              </MenuItem>

              {/* ── Flota (split: abrir panel | guardar) ── */}
              <div
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 1px 1px rgba(0,0,0,0.04)' }}
                className="flex rounded-[13px] bg-white border border-black/[0.07] overflow-hidden"
              >
                <button
                  onClick={() => { setMenuOpen(false); setFlotaOpen(true); }}
                  className="flex-1 h-[54px] px-3.5 flex items-center gap-3 transition-all active:scale-[0.98] hover:bg-kbg"
                >
                  <Icon3D emoji="🚛" from="#3D52CC" to="#1B2A6B" shadow="rgba(27,42,107,0.45)" />
                  <div className="flex-1 text-left">
                    <div className="text-[14px] font-semibold text-ktext">Flota</div>
                    <div className="text-[11px] text-kmuted">{activosCount} activos · {flota.length} total</div>
                  </div>
                  <span className="text-[16px] text-black/20 font-light">›</span>
                </button>
                <div className="w-px bg-black/[0.07] my-3 flex-shrink-0" />
                <button
                  onClick={onGuardarFlota}
                  disabled={flotaStatus === 'saving'}
                  title="Guardar Flota"
                  className={`w-[54px] flex items-center justify-center text-[19px] transition-all active:scale-95 disabled:opacity-50
                    ${flotaStatus === 'success' ? 'text-[#34C759]' : flotaStatus === 'error' ? 'text-kred' : 'text-knavy'}`}
                >
                  {saveIcon}
                </button>
              </div>

              {/* ── Actualizar datos ── */}
              <MenuItem
                onClick={() => { onUpdate(); setMenuOpen(false); }}
                disabled={updateStatus === 'loading'}
              >
                <Icon3D
                  emoji={updateStatus === 'success' ? '✅' : updateStatus === 'error' ? '⚠️' : '🔄'}
                  from={updateStatus === 'success' ? '#30D158' : updateStatus === 'error' ? '#FF6B6B' : '#FF5252'}
                  to={updateStatus === 'success' ? '#25A244' : updateStatus === 'error' ? '#C42020' : '#C42020'}
                  shadow={updateStatus === 'success' ? 'rgba(37,162,68,0.4)' : 'rgba(196,32,32,0.4)'}
                />
                <div className="flex-1 text-left">
                  <div className={`text-[14px] font-semibold ${updateStatus === 'success' ? 'text-[#25A244]' : updateStatus === 'error' ? 'text-kred' : 'text-ktext'}`}>
                    {updLabel}
                  </div>
                  <div className="text-[11px] text-kmuted">{total} tiendas cargadas</div>
                </div>
              </MenuItem>

              {/* ── Cerrar sesión ── */}
              {onSignOut && (
                <MenuItem onClick={() => { setMenuOpen(false); onSignOut(); }}>
                  <Icon3D emoji="🚪" from="#FF6B6B" to="#C42020" shadow="rgba(196,32,32,0.35)" />
                  <div className="flex-1 text-left">
                    <div className="text-[14px] font-semibold text-kred">Cerrar sesión</div>
                  </div>
                </MenuItem>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pb-6 pt-2 text-center">
              <span className="text-[10px] text-kmuted font-mono">KiosClub · Enrutamiento v4.3</span>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* ── Panel Flota (overlay completo) ─────────────────────────── */}
      {flotaOpen && createPortal(
        <>
          <div
            className="fixed inset-0 bg-black/[0.42] z-[900] backdrop-blur-sm"
            onClick={() => setFlotaOpen(false)}
          />
          <div className="fixed top-0 right-0 w-[min(390px,100%)] lg:w-[620px] h-full bg-white z-[901] overflow-y-auto flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.14)]">

            {/* Panel header */}
            <div
              style={{ background: 'linear-gradient(160deg, #1B2A6B 0%, #2D3FA0 100%)' }}
              className="px-[18px] py-[18px] flex items-start justify-between sticky top-0 z-10 flex-shrink-0"
            >
              <div>
                <div className="text-[10px] font-semibold text-white/60 uppercase tracking-[1px]">CONFIGURACIÓN</div>
                <div className="text-[17px] font-bold text-white mt-0.5">🚛 Flota</div>
                <div className="text-[12px] text-white/60 mt-0.5">{activosCount} activos · {flota.length} en total</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onGuardarFlota}
                  disabled={flotaStatus === 'saving'}
                  className={`h-[30px] px-3 rounded-[7px] bg-white/[0.18] text-[12px] font-bold flex items-center gap-1.5 hover:bg-white/[0.28] transition-all disabled:opacity-50
                    ${flotaStatus === 'success' ? 'text-[#34C759]' : flotaStatus === 'error' ? 'text-red-300' : 'text-white'}`}
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
                onEliminarVehiculo={onEliminarVehiculo}
              />
            </div>
          </div>
        </>,
        document.body
      )}
    </header>
  );
}
