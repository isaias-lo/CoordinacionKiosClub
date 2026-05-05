'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { TiendaInfo } from '../data/tiendas';

interface Props {
  updateStatus: string;
  tiendas: Record<string, TiendaInfo>;
  onUpdate: () => void;
  onOpenConfig: () => void;
  flotaStatus: string;
  onGuardarFlota: () => void;
  onBack?: () => void;
}

export default function Header({ updateStatus, tiendas, onUpdate, onOpenConfig, flotaStatus, onGuardarFlota, onBack }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const total = Object.keys(tiendas).length;

  const updLabel = updateStatus === 'loading' ? 'Actualizando...'
    : updateStatus === 'success' ? `${total} tiendas · OK`
    : updateStatus === 'error'   ? 'Error — reintentar'
    : 'Actualizar datos';

  const updIcon = updateStatus === 'success' ? '✓'
    : updateStatus === 'error'   ? '⚠'
    : '↻';

  const updColor = updateStatus === 'success' ? '#34C759'
    : updateStatus === 'error'   ? '#ff3b30'
    : '';

  return (
    <header className="bg-white border-b border-black/[0.09] sticky top-0 z-[100] no-print">
      <div className="max-w-[700px] mx-auto flex items-center justify-between h-[60px] px-4">

        <div className="flex items-center gap-2.5">
          {onBack && (
            <button
              onClick={onBack}
              className="w-[34px] h-[34px] rounded-[8px] flex items-center justify-center bg-kbg border border-black/[0.1] hover:bg-kred/[0.07] hover:border-kred/[0.2] transition-all text-kmuted hover:text-kred text-[18px]"
              aria-label="Volver"
            >
              ←
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

      {menuOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setMenuOpen(false)} />
          <div className="fixed right-0 top-0 z-[201] w-[min(280px,90vw)] h-full bg-white shadow-[-4px_0_20px_rgba(0,0,0,0.12)] flex flex-col overflow-y-auto">
            <div className="px-4 py-3 border-b border-black/[0.09] flex items-center justify-between">
              <span className="text-[14px] font-bold text-ktext">Menú</span>
              <button
                onClick={() => setMenuOpen(false)}
                className="w-[30px] h-[30px] rounded-full bg-kbg flex items-center justify-center text-[16px] text-kmuted hover:text-ktext"
              >
                ✕
              </button>
            </div>
            <div className="p-3 space-y-2">
              {onBack && (
                <button
                  onClick={() => { onBack(); setMenuOpen(false); }}
                  className="w-full h-[42px] px-3 rounded-[8px] bg-kbg border border-black/[0.12] text-kmuted text-[13px] font-semibold flex items-center gap-2.5 transition-all hover:border-kred/[0.25] hover:text-kred"
                >
                  ← Volver al Despacho
                </button>
              )}
              <button
                onClick={() => { onOpenConfig(); setMenuOpen(false); }}
                className="w-full h-[42px] px-3 rounded-[8px] bg-kbg border border-black/[0.12] text-kmuted text-[13px] font-semibold flex items-center gap-2.5 transition-all hover:border-kred/[0.25] hover:text-kred"
              >
                📅 Configurar Calendario
              </button>
              <button
                onClick={() => { onGuardarFlota(); setMenuOpen(false); }}
                disabled={flotaStatus === 'saving'}
                className="w-full h-[42px] px-3 rounded-[8px] bg-knavy/[0.07] border border-knavy/[0.15] text-knavy text-[13px] font-semibold flex items-center gap-2.5 transition-all disabled:opacity-60"
              >
                💾 Guardar Flota
              </button>
              <button
                onClick={() => { onUpdate(); setMenuOpen(false); }}
                disabled={updateStatus === 'loading'}
                style={{ color: updColor || undefined }}
                className="w-full h-[42px] px-3 rounded-[8px] bg-kred/[0.07] border border-kred/[0.15] text-kred text-[13px] font-semibold flex items-center gap-2.5 transition-all disabled:opacity-60"
              >
                {updIcon} {updLabel}
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </header>
  );
}
