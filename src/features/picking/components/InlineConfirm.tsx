'use client';

import { AlertTriangle } from 'lucide-react';

interface Props {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning';
}

// Reemplaza window.confirm/alert (bloqueantes, poco aptos para tablets de bodega
// compartidas) con el mismo patrón visual ya usado en PickerGroupCard para confirmar
// la eliminación de un pallet ya impreso.
export function InlineConfirm({
  message, onCancel, onConfirm, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'danger',
}: Props) {
  const colors = tone === 'warning'
    ? { bg: '#FFFBEB', border: 'rgba(217,119,6,0.3)', icon: '#D97706', text: '#92400E', confirmBg: '#D97706' }
    : { bg: '#FFF1F2', border: 'rgba(220,38,38,0.3)', icon: '#DC2626', text: '#991B1B', confirmBg: '#DC2626' };
  return (
    <div role="alertdialog" aria-live="assertive" className="mt-3 rounded px-3 py-2.5 flex items-center gap-3"
      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
      <AlertTriangle size={14} style={{ color: colors.icon, flexShrink: 0 }} aria-hidden="true" />
      <div className="flex-1 text-[12px]" style={{ color: colors.text }}>{message}</div>
      <button type="button" onClick={onCancel}
        className="text-[12px] font-medium px-2.5 py-1 rounded border cursor-pointer shrink-0"
        style={{ borderColor: 'var(--color-border)', color: '#64748B', background: '#fff' }}>
        {cancelLabel}
      </button>
      <button type="button" onClick={onConfirm}
        className="text-[12px] font-semibold px-2.5 py-1 rounded border-none cursor-pointer shrink-0"
        style={{ background: colors.confirmBg, color: '#fff' }}>
        {confirmLabel}
      </button>
    </div>
  );
}
