'use client';

import { useState, useRef, useEffect } from 'react';
import { Settings } from 'lucide-react';

export function PickerNombreSelector({ pickerNombre, pickerNombresList, onChange }: {
  pickerNombre: string; pickerNombresList: string[]; onChange: (n: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const uniqueNames = Array.from(new Set(pickerNombresList.map(n => n.trim()).filter(Boolean))).sort();
  const filtered = uniqueNames.filter(n => !query || n.toLowerCase().includes(query.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(o => !o)}
        className={`w-full bg-white border-[1.5px] rounded-btn px-3 py-3 flex items-center justify-between cursor-pointer transition-all ${open ? 'border-navy shadow-[0_0_0_3px_rgba(26,37,80,0.08)]' : 'border-border'}`}
        style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
        {pickerNombre
          ? <span className="font-semibold text-text text-[15px]">{pickerNombre}</span>
          : <span className="text-text-3 font-barlow text-[15px]">{uniqueNames.length === 0 ? 'Sin pickers configurados…' : 'Seleccionar picker…'}</span>}
        <span className="text-text-3 ml-2 flex-shrink-0">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-border rounded-card mt-1 shadow-2xl overflow-hidden">
          {uniqueNames.length > 4 && (
            <div className="p-2 border-b border-border">
              <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Buscar picker…" className="w-full bg-bg border border-border rounded-btn px-3 py-2 text-text font-barlow text-[14px] outline-none focus:border-navy" />
            </div>
          )}
          <div className="max-h-48 overflow-y-auto">
            {pickerNombre && (
              <div onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
                className="px-4 py-2 cursor-pointer border-b border-border/40 text-text-3 text-[12px] italic hover:bg-bg">
                — Sin picker
              </div>
            )}
            {filtered.length === 0 && <div className="py-5 text-center text-text-3 text-[13px]">{uniqueNames.length === 0 ? <span className="inline-flex items-center gap-1">Configura pickers en <Settings size={12} aria-hidden="true" /> Configuración</span> : 'Sin resultados'}</div>}
            {filtered.map(name => (
              <div key={name} onClick={() => { onChange(name); setOpen(false); setQuery(''); }}
                className={`px-4 py-2.5 cursor-pointer border-b border-border/40 last:border-b-0 font-barlow text-[14px] ${pickerNombre === name ? 'bg-[rgba(26,37,80,0.06)] text-navy font-semibold' : 'text-text hover:bg-bg'}`}>
                {name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
