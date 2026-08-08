'use client';
import { RotateCcw, X } from 'lucide-react';
import type { UndoPending } from './useUndoDelete';

/** Snackbar inferior de "deshacer borrado": muestra el label + botón Revertir. */
export function UndoBar({ pending, onRevert, onClose }: {
  pending: UndoPending | null;
  onRevert: () => void;
  onClose: () => void;
}) {
  if (!pending) return null;
  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-3 pl-4 pr-2 py-2.5 rounded-[12px] text-white text-[13px] shadow-[0_8px_28px_rgba(0,0,0,0.35)]"
      style={{ background: '#1B2A6B', maxWidth: '92vw' }}
    >
      <span className="truncate">🗑 {pending.label}</span>
      <button onClick={onRevert} className="flex items-center gap-1 font-bold text-[#7FD1FF] hover:text-white transition-colors flex-shrink-0">
        <RotateCcw size={14} /> Revertir
      </button>
      <button onClick={onClose} aria-label="Cerrar" className="w-7 h-7 rounded-full flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0">
        <X size={14} />
      </button>
    </div>
  );
}
