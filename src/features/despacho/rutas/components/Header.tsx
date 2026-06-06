'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { TiendaInfo } from '../data/tiendas';

interface Props {
  updateStatus: string;
  tiendas: Record<string, TiendaInfo>;
  onUpdate: () => void;
  onOpenConfig: () => void;
  onBack?: () => void;
  onSignOut?: () => void;
}

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

export default function Header({ updateStatus, tiendas, onUpdate, onOpenConfig, onBack, onSignOut }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const total = Object.keys(tiendas).length;

  const updLabel = updateStatus === 'loading' ? 'Actualizando...'
    : updateStatus === 'success' ? `${total} tiendas · OK`
    : updateStatus === 'error'   ? 'Error — reintentar'
    : 'Actualizar datos';

  useEffect(() => {
    const handler = () => setMenuOpen(true);
    window.addEventListener('open-enrutador-menu', handler);
    return () => window.removeEventListener('open-enrutador-menu', handler);
  }, []);

  return (
    <>
      {menuOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setMenuOpen(false)} />
          <div className="fixed right-0 top-0 z-[201] w-[min(300px,92vw)] lg:w-[400px] h-full bg-[#F2F2F7] flex flex-col overflow-y-auto">

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

            <div className="p-4 space-y-2.5 flex-1">

              {onBack && (
                <MenuItem onClick={() => { onBack(); setMenuOpen(false); }}>
                  <Icon3D emoji="←" from="#8E8E93" to="#636366" shadow="rgba(99,99,102,0.35)" />
                  <div className="flex-1 text-left">
                    <div className="text-[14px] font-semibold text-ktext">Volver</div>
                  </div>
                  <span className="text-[16px] text-black/20 font-light">›</span>
                </MenuItem>
              )}

              <MenuItem onClick={() => { onOpenConfig(); setMenuOpen(false); }}>
                <Icon3D emoji="📅" from="#FF5252" to="#C42020" shadow="rgba(196,32,32,0.4)" />
                <div className="flex-1 text-left">
                  <div className="text-[14px] font-semibold text-ktext">Calendario</div>
                  <div className="text-[11px] text-kmuted">Configurar despacho</div>
                </div>
                <span className="text-[16px] text-black/20 font-light">›</span>
              </MenuItem>

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

              {onSignOut && (
                <MenuItem onClick={() => { setMenuOpen(false); onSignOut(); }}>
                  <Icon3D emoji="🚪" from="#FF6B6B" to="#C42020" shadow="rgba(196,32,32,0.35)" />
                  <div className="flex-1 text-left">
                    <div className="text-[14px] font-semibold text-kred">Cerrar sesión</div>
                  </div>
                </MenuItem>
              )}
            </div>

            <div className="px-5 pb-6 pt-2 text-center">
              <span className="text-[10px] text-kmuted font-mono">KiosClub · Enrutamiento v4.3</span>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
