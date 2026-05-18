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

export function CombineItemsModal({ pkgLabel, srcLabel, tgtLabel, mergedGuia, mergedValor, onConfirm, onCancel }: CombineItemsModalProps) {
  const [peso, setPeso] = useState('');
  const [alto, setAlto] = useState('');
  const canConfirm = parseFloat(peso) > 0 && parseFloat(alto) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-xl p-6 mx-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="font-barlow-condensed text-[18px] font-bold text-navy tracking-wide mb-4">⊕ Combinar {pkgLabel}</h3>

        <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-2">
          <div className="flex items-start gap-2 text-[13px]">
            <span className="mt-0.5 w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex-shrink-0 flex items-center justify-center font-bold text-[9px]">1</span>
            <span className="text-text-2">{srcLabel}</span>
          </div>
          <div className="flex items-start gap-2 text-[13px]">
            <span className="mt-0.5 w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex-shrink-0 flex items-center justify-center font-bold text-[9px]">2</span>
            <span className="text-text-2">{tgtLabel}</span>
          </div>
        </div>

        {(mergedGuia || mergedValor != null) && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
            <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Guías combinadas</div>
            {mergedGuia && <div className="font-mono text-[12px] text-emerald-800 break-all">{mergedGuia}</div>}
            {!!mergedValor && <div className="text-[12px] font-bold text-emerald-700 mt-1">${mergedValor.toLocaleString('es-CL')} total</div>}
          </div>
        )}

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-[11px] font-bold text-text-3 uppercase tracking-wider mb-1">Nuevo peso (kg)</label>
            <input type="number" value={peso} onChange={e => setPeso(e.target.value)} min="0" step="0.1"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-navy" placeholder="ej. 35" autoFocus />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-text-3 uppercase tracking-wider mb-1">Nueva altura (cm)</label>
            <input type="number" value={alto} onChange={e => setAlto(e.target.value)} min="0" step="1"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-navy" placeholder="ej. 120" />
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-border text-[13px] font-bold text-text-2 cursor-pointer bg-white hover:bg-gray-50">Cancelar</button>
          <button onClick={() => canConfirm && onConfirm(parseFloat(peso), parseFloat(alto))} disabled={!canConfirm}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white cursor-pointer transition-all disabled:opacity-40"
            style={{ background: '#10B981' }}>
            Combinar
          </button>
        </div>
      </div>
    </div>
  );
}
