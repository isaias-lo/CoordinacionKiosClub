'use client';

import { useState } from 'react';
import { SUBTIPO_LABEL, OP_PREFIX } from '../../constants';
import { buscarOperaciones } from '../../utils/odooApi';
import { getPickerDisplay } from '../../data/pickerNames';
import type { SubTipo, OperacionOdoo, OdooConfig } from '../../types';

interface OpSearch { loading: boolean; results: OperacionOdoo[]; open: boolean; error: string }

export function OperacionInput({ subTipo, codigo, onChange, onSelect, odooConfig, onNeedConfig, pickerLabel }: {
  subTipo: SubTipo; codigo: string; onChange: (v: string) => void;
  onSelect?: (codigo: string, responsable: string | undefined) => void;
  odooConfig: OdooConfig; onNeedConfig: () => void;
  pickerLabel?: string;
}) {
  const [s, setS] = useState<OpSearch>({ loading: false, results: [], open: false, error: '' });
  // Show only the 5-digit suffix; the prefix is fixed
  const digits = codigo.startsWith(OP_PREFIX) ? codigo.slice(OP_PREFIX.length) : codigo;
  const fullCodigo = digits ? `${OP_PREFIX}${digits}` : '';
  const buscar = async () => {
    if (!odooConfig.url) { onNeedConfig(); return; }
    if (!fullCodigo) return;
    setS({ loading: true, results: [], open: false, error: '' });
    try { const ops = await buscarOperaciones(odooConfig, fullCodigo); setS({ loading: false, results: ops, open: ops.length > 0, error: ops.length ? '' : 'Sin resultados' }); }
    catch (e) { setS({ loading: false, results: [], open: false, error: e instanceof Error ? e.message : 'Error' }); }
  };
  const select = (op: OperacionOdoo) => { onChange(op.name); onSelect?.(op.name, op.responsable); setS({ loading: false, results: [], open: false, error: '' }); };
  return (
    <div className="mb-2.5">
      <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-1.5 flex items-center gap-2">
        Op. {SUBTIPO_LABEL[subTipo]}
        {pickerLabel && <span className="normal-case tracking-normal text-[10px] font-semibold text-info bg-[rgba(37,99,235,0.08)] px-1.5 py-0.5 rounded-full">{pickerLabel}</span>}
      </div>
      <div className="flex gap-2">
        {/* Prefix shown as static badge + only 5-digit input */}
        <div className="flex-1 flex items-center bg-white border-[1.5px] border-border rounded-btn overflow-hidden focus-within:border-navy" style={{ boxShadow: '0 1px 3px rgba(26,37,80,0.06)' }}>
          <span className="px-2.5 py-2.5 font-mono text-[13px] text-text-3 bg-bg border-r border-border select-none flex-shrink-0">{OP_PREFIX}</span>
          <input
            type="text" inputMode="numeric" maxLength={5}
            value={digits}
            onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 5); onChange(v ? `${OP_PREFIX}${v}` : ''); setS(p => ({ ...p, open: false })); }}
            onKeyDown={e => e.key === 'Enter' && buscar()}
            placeholder="12345"
            className="flex-1 bg-transparent px-2 py-2.5 font-mono text-[15px] font-bold outline-none [-webkit-appearance:none] placeholder:text-text-3 placeholder:font-normal placeholder:text-[13px]"
          />
        </div>
        <button onClick={buscar} disabled={s.loading || !fullCodigo} className="px-3 py-2.5 bg-navy text-white border-none rounded-btn font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center w-12" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.25)' }}>
          {s.loading ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : '🔍'}
        </button>
      </div>
      {s.error && <div className="mt-1 text-[11px] text-red">{s.error}</div>}
      {s.open && s.results.length > 0 && (
        <div className="mt-1 bg-white border border-border rounded-card shadow-xl overflow-hidden z-10 relative">
          {s.results.map(op => (
            <div key={op.id} onClick={() => select(op)} className="px-3 py-2.5 cursor-pointer border-b border-border/40 last:border-b-0 hover:bg-bg flex items-center gap-3 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[12px] font-bold text-navy">{op.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-text-3 truncate">{op.partner}</span>
                  {op.responsable && <span className="text-[10px] font-bold text-info bg-[rgba(37,99,235,0.08)] px-1.5 py-0.5 rounded flex-shrink-0">{getPickerDisplay(op.responsable)}</span>}
                </div>
              </div>
              <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${op.state === 'Listo' ? 'bg-[rgba(22,163,74,0.10)] text-success' : op.state === 'Hecho' ? 'bg-[rgba(37,99,235,0.10)] text-info' : 'bg-[rgba(217,119,6,0.10)] text-warn'}`}>{op.state}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
