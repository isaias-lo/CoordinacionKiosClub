'use client';

import { useState } from 'react';
import { CameraBarcodeScanner } from '@/features/auditoria/components/scanner/CameraBarcodeScanner';
import type { PickingSlot } from '@/features/despacho/santiago/components/PickingSlotCards';

interface Props {
  /** Etiqueta del tipo que se está agregando (para el título). */
  tipoLabel: string;
  /** Código de la tienda seleccionada (para validar/reclamar). */
  storeCod: string;
  /** Fecha de hoy (YYYY-MM-DD). */
  date: string;
  /** Crear N nuevos (cantidad ≥ 1). El padre hace el loop de altas. */
  onNuevo: (cantidad: number) => void;
  /** Pallet preexistente reclamado y re-datado a hoy. */
  onExistente: (slot: PickingSlot) => void;
  onClose: () => void;
}

/**
 * Diálogo al agregar un bulto/pallet/contenedor/chocolate: permite crear uno NUEVO
 * (como siempre) o registrar uno PREEXISTENTE (adelantado de otro día, ya etiquetado)
 * digitando su #número o escaneando su código de barras.
 */
export function AgregarPalletDialog({ tipoLabel, storeCod, date, onNuevo, onExistente, onClose }: Props) {
  const [modo, setModo]         = useState<'elegir' | 'preexistente'>('elegir');
  const [ref, setRef]           = useState('');
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(1); // "agregar de a N" (crear varios juntos)

  async function claim(refValue: string) {
    const r = refValue.trim().replace(/^#/, '');
    if (!r) { setError('Ingresa o escanea el número del pallet.'); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/picking-pallets/claim-bodega', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: r, date, store_cod: storeCod }),
      });
      const json = await res.json() as { data?: PickingSlot; reason?: string; store_cod?: string; error?: string };
      if (!res.ok) {
        if (json.reason === 'otra_tienda')        setError(`Este pallet es de la tienda ${json.store_cod} — no se puede agregar aquí.`);
        else if (json.reason === 'no_encontrado') setError(`No encontramos el pallet #${r}. Verifica el número.`);
        else                                       setError(json.error || 'No se pudo agregar el pallet.');
        return;
      }
      if (json.data) onExistente(json.data);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  // Escáner de cámara (pantalla completa). Al detectar, reclama por el valor leído.
  if (scanning) {
    return (
      <CameraBarcodeScanner
        onScan={(raw) => { setScanning(false); setRef(raw); void claim(raw); return true; }}
        onClose={() => setScanning(false)}
        onManualEntry={() => setScanning(false)}
        manualEntryLabel="✏️ Digitar el número de la etiqueta"
      />
    );
  }

  const bigBtn: React.CSSProperties = {
    width: '100%', textAlign: 'left', borderRadius: 14, padding: '14px 16px',
    border: '1.5px solid #E2E8F0', background: '#fff', cursor: 'pointer',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white"
        style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <span className="font-bold text-[17px]" style={{ color: '#0F172A' }}>Agregar {tipoLabel}</span>
          <button onClick={onClose} aria-label="Cerrar"
            className="text-[24px] leading-none cursor-pointer" style={{ color: '#94A3B8', background: 'none', border: 'none' }}>×</button>
        </div>

        {modo === 'elegir' ? (
          <div className="p-4 flex flex-col gap-3">
            <div style={bigBtn}>
              <div className="text-[16px] font-bold" style={{ color: '#0F172A' }}>🆕 Nuevo</div>
              <div className="text-[12px] mt-0.5" style={{ color: '#64748B' }}>
                Crear {cantidad > 1 ? `${cantidad} de una vez` : 'uno nuevo'}.
              </div>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-[12px] font-semibold" style={{ color: '#475569' }}>Cantidad</span>
                <button onClick={() => setCantidad(c => Math.max(1, c - 1))} aria-label="Menos"
                  className="w-8 h-8 rounded-lg text-[18px] font-bold cursor-pointer"
                  style={{ border: '1.5px solid #E2E8F0', background: '#fff', color: '#334155' }}>−</button>
                <span className="text-[16px] font-bold tabular-nums" style={{ minWidth: 26, textAlign: 'center', color: '#0F172A' }}>{cantidad}</span>
                <button onClick={() => setCantidad(c => Math.min(50, c + 1))} aria-label="Más"
                  className="w-8 h-8 rounded-lg text-[18px] font-bold cursor-pointer"
                  style={{ border: '1.5px solid #E2E8F0', background: '#fff', color: '#334155' }}>+</button>
                <button onClick={() => { const n = cantidad; onClose(); onNuevo(n); }}
                  className="ml-auto rounded-xl px-4 py-2 font-bold text-[14px] cursor-pointer"
                  style={{ background: '#16A34A', color: '#fff', border: 'none' }}>
                  Crear{cantidad > 1 ? ` ${cantidad}` : ''}
                </button>
              </div>
            </div>
            <button style={{ ...bigBtn, borderColor: '#BFDBFE', background: '#F8FAFF' }} onClick={() => setModo('preexistente')}>
              <div className="text-[16px] font-bold" style={{ color: '#1E40AF' }}>📦 Preexistente (ya etiquetado)</div>
              <div className="text-[12px] mt-0.5" style={{ color: '#64748B' }}>Pallet adelantado de otro día que ya tiene su etiqueta.</div>
            </button>
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-3">
            <p className="text-[13px]" style={{ color: '#475569' }}>
              Digita el número de la etiqueta (ej. <b>#1050</b>) o escanéala con la cámara.
            </p>

            <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ border: '1.5px solid #CBD5E1' }}>
              <span className="text-[18px] font-bold" style={{ color: '#94A3B8' }}>#</span>
              <input
                autoFocus
                inputMode="numeric"
                value={ref}
                onChange={e => { setRef(e.target.value); if (error) setError(null); }}
                onKeyDown={e => { if (e.key === 'Enter') void claim(ref); }}
                placeholder="1050"
                className="flex-1 text-[18px] font-semibold outline-none"
                style={{ color: '#0F172A', border: 'none' }}
              />
            </div>

            <button onClick={() => setScanning(true)}
              className="flex items-center justify-center gap-2 rounded-xl py-3 font-bold text-[14px] cursor-pointer"
              style={{ background: '#1E40AF', color: '#fff', border: 'none' }}>
              📷 Escanear código de barras
            </button>

            {error && (
              <div className="rounded-xl px-3 py-2.5 text-[13px] font-medium"
                style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C' }}>
                {error}
              </div>
            )}

            <div className="flex gap-2 mt-1">
              <button onClick={() => { setModo('elegir'); setError(null); setRef(''); }}
                className="flex-1 rounded-xl py-2.5 font-semibold text-[14px] cursor-pointer"
                style={{ background: '#F1F5F9', color: '#475569', border: 'none' }}>
                Atrás
              </button>
              <button onClick={() => void claim(ref)} disabled={loading}
                className="flex-1 rounded-xl py-2.5 font-bold text-[14px] cursor-pointer"
                style={{ background: loading ? '#94A3B8' : '#16A34A', color: '#fff', border: 'none' }}>
                {loading ? 'Buscando…' : 'Agregar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
