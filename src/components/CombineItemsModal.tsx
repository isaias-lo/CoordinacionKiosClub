'use client';
import { useState } from 'react';

interface CombineItemsModalProps {
  pkgLabel: string;
  srcLabel: string;
  tgtLabel: string;
  mergedGuia?: string;
  mergedValor?: number;
  onConfirm: (peso: number, alto: number) => void;
  onCancel: () => void;
}

const inputCls = [
  'w-full rounded-[6px] px-3 py-2.5 font-mono text-[13px] outline-none transition-all',
  'bg-surface-raised border border-line-2',
  'text-txt-hi placeholder:text-[rgba(255,255,255,0.20)]',
  'focus:border-[rgba(212,43,43,0.50)]',
].join(' ');

const labelCls = 'block font-mono text-[10px] font-semibold uppercase tracking-[0.14em] mb-1.5 text-txt-lo';

export function CombineItemsModal({ pkgLabel, srcLabel, tgtLabel, mergedGuia, mergedValor, onConfirm, onCancel }: CombineItemsModalProps) {
  const [peso, setPeso] = useState('');
  const [alto, setAlto] = useState('');
  const canConfirm = parseFloat(peso) > 0 && parseFloat(alto) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
         style={{ background: 'rgba(0,0,0,0.72)' }}
         onClick={onCancel}>
      <div className="rounded-[10px] mx-4 w-full max-w-sm overflow-hidden"
           style={{ background: 'var(--surface-card)', border: '1px solid var(--line)' }}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: 'var(--text-lo)' }}>Combinar</span>
          <div className="font-mono text-[15px] font-bold mt-0.5"
               style={{ color: 'var(--text-hi)' }}>{pkgLabel}</div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Items a combinar */}
          <div className="rounded-[6px] p-3 space-y-2"
               style={{ background: 'var(--surface-inset)', border: '1px solid var(--line)' }}>
            {[srcLabel, tgtLabel].map((label, i) => (
              <div key={i} className="flex items-start gap-2.5 text-[12px]">
                <span className="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center font-mono font-bold text-[9px] mt-0.5"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-mid)' }}>
                  {i + 1}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.65)' }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Guías combinadas */}
          {(mergedGuia || mergedValor != null) && (
            <div className="rounded-[6px] p-3"
                 style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.22)' }}>
              <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] mb-1.5"
                   style={{ color: 'rgba(74,222,128,0.70)' }}>Guías combinadas</div>
              {mergedGuia && (
                <div className="font-mono text-[12px] break-all" style={{ color: '#4ADE80' }}>{mergedGuia}</div>
              )}
              {!!mergedValor && (
                <div className="font-mono text-[12px] font-bold mt-1" style={{ color: 'rgba(74,222,128,0.80)' }}>
                  ${mergedValor.toLocaleString('es-CL')} total
                </div>
              )}
            </div>
          )}

          {/* Inputs */}
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Nuevo peso (kg)</label>
              <input type="number" value={peso} onChange={e => setPeso(e.target.value)}
                     min="0" step="0.1" placeholder="ej. 35" autoFocus
                     className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Nueva altura (cm)</label>
              <input type="number" value={alto} onChange={e => setAlto(e.target.value)}
                     min="0" step="1" placeholder="ej. 120"
                     className={inputCls} />
            </div>
          </div>

          {/* Acciones */}
          <div className="flex gap-2 pt-1">
            <button onClick={onCancel}
                    className="flex-1 py-2.5 rounded-[6px] font-mono text-[11px] font-semibold uppercase tracking-widest cursor-pointer transition-all active:opacity-70"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.45)' }}>
              Cancelar
            </button>
            <button onClick={() => canConfirm && onConfirm(parseFloat(peso), parseFloat(alto))}
                    disabled={!canConfirm}
                    className="flex-1 py-2.5 rounded-[6px] font-mono text-[11px] font-semibold uppercase tracking-widest cursor-pointer transition-all active:opacity-75 disabled:opacity-30"
                    style={{ background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.28)', color: '#4ADE80' }}>
              Combinar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
