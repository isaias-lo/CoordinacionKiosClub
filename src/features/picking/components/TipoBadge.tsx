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
  const hasCC = tipos.includes('CC');
  const hasCN = tipos.includes('CN');
  const parts: string[] = [];
  if (hasP)  parts.push('Pallet');
  if (hasB)  parts.push('Bulto');
  if (hasC)  parts.push('Cont.');
  if (hasCH) parts.push('Chocolates');
  if (hasCC) parts.push('Caja Cartón');
  if (hasCN) parts.push('Caja Negra');
  const label   = parts.join(' + ') || '—';
  const isMulti = parts.length > 1;
  const hasCaja = hasCC || hasCN;
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold"
      style={{
        background: isMulti ? '#EFF6FF' : hasB ? '#F0FDF4' : hasC ? '#FAF5FF' : hasCH ? '#FFFBEB' : hasCaja ? 'rgba(8,145,178,0.10)' : '#EFF6FF',
        color:      isMulti ? '#1E40AF' : hasB ? '#15803D' : hasC ? '#6B21A8' : hasCH ? '#92400E' : hasCaja ? '#0891B2' : '#1E40AF',
        border: `1px solid ${isMulti ? '#BFDBFE' : hasB ? '#BBF7D0' : hasC ? '#E9D5FF' : hasCH ? '#FDE68A' : hasCaja ? 'rgba(8,145,178,0.30)' : '#BFDBFE'}`,
      }}>
      {label}
    </span>
  );
}
