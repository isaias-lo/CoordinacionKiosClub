'use client';
import { RefreshCw, Check } from 'lucide-react';

export function PickerOdooDisplay({ picker, odooDetected, onClear }: {
  picker: string; odooDetected?: boolean; onClear: () => void;
}) {
  if (!picker) {
    return (
      <div className="w-full bg-bg border border-dashed border-border rounded-btn px-3 py-3 flex items-center gap-2"
        style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.04)' }}>
        <RefreshCw size={16} className="text-text-3 flex-shrink-0" aria-hidden="true" />
        <span className="text-text-3 font-barlow text-[14px]">Asignado automáticamente al cargar la operación Odoo</span>
      </div>
    );
  }
  const parts = picker.split(' + ');
  return (
    <div className="w-full bg-white border border-border rounded-btn px-3 py-3 flex items-center gap-3"
      style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
      <div className="flex flex-wrap gap-1.5 flex-shrink-0">
        {parts.map((p, i) => (
          <span key={i} className="font-mono text-[13px] font-bold text-navy bg-[rgba(26,37,80,0.07)] px-2.5 py-1 rounded">
            {p.replace(/Pickers\s+/gi, 'P.')}
          </span>
        ))}
      </div>
      {odooDetected && (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[rgba(37,99,235,0.10)] text-info border border-info/20">
          Odoo <Check size={11} aria-hidden="true" />
        </span>
      )}
      <span className="flex-1 text-[13px] text-text-2">{picker}</span>
      <button onClick={onClear}
        className="border-none bg-transparent text-text-3 hover:text-red cursor-pointer text-[16px] leading-none px-1 transition-colors"
        title="Limpiar">×</button>
    </div>
  );
}
