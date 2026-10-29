'use client';
import { RotateCcw, X } from 'lucide-react';
import type { UndoPending } from './useUndoDelete';

/**
 * Aviso inferior para deshacer: muestra qué se hizo y el botón Deshacer.
 *
 * Desde el 22/10/2026 va sin el 🗑 (hacía creer que sumar había borrado algo), con botones de
 * 44 px y más arriba (`bottom-24`). Abajo no choca con la barra «Sumar a»: esa barra se pega al pie
 * solo con algo marcado, y al sumar las marcas se limpian. Arriba no puede ir: ahí salen los avisos
 * («Sumado a P1…») y lo tapaban.
 */
export function UndoBar({ pending, onRevert, onClose }: {
  pending: UndoPending | null;
  onRevert: () => void;
  onClose: () => void;
}) {
  if (!pending) return null;
  return (
    <div
      role="status"
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-2 pl-4 pr-1 py-1 rounded-[12px] text-white text-apoyo shadow-[0_8px_28px_rgba(0,0,0,0.35)]"
      style={{ background: '#1B2A6B', maxWidth: '92vw' }}
    >
      <span className="truncate">{pending.label}</span>
      <button onClick={onRevert} className="min-h-[44px] px-2 flex items-center gap-1 font-bold text-[#7FD1FF] hover:text-white transition-colors flex-shrink-0">
        <RotateCcw size={16} aria-hidden="true" /> Deshacer
      </button>
      <button onClick={onClose} aria-label="Cerrar aviso" className="w-[44px] h-[44px] rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
