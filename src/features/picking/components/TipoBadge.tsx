'use client';

/**
 * Badge que muestra el(los) tipo(s) de pallet de forma legible.
 * Usado en ActivityTab, HistorialTab y cualquier otra vista de picking.
 */
export function TipoBadge({ tipos }: { tipos: string[] }) {
  const hasP  = tipos.includes('P');
  const hasB  = tipos.includes('B');
  const hasC  = tipos.includes('C');
  const hasCH = tipos.includes('CH');
  const parts: string[] = [];
  if (hasP)  parts.push('Pallet');
  if (hasB)  parts.push('Bulto');
  if (hasC)  parts.push('Cont.');
  if (hasCH) parts.push('Chocolates');
  const label   = parts.join(' + ') || '—';
  const isMulti = parts.length > 1;
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold"
      style={{
        background: isMulti ? '#EFF6FF' : hasB ? '#F0FDF4' : hasC ? '#FAF5FF' : hasCH ? '#FFFBEB' : '#EFF6FF',
        color:      isMulti ? '#1E40AF' : hasB ? '#15803D' : hasC ? '#6B21A8' : hasCH ? '#92400E' : '#1E40AF',
        border: `1px solid ${isMulti ? '#BFDBFE' : hasB ? '#BBF7D0' : hasC ? '#E9D5FF' : hasCH ? '#FDE68A' : '#BFDBFE'}`,
      }}>
      {label}
    </span>
  );
}
