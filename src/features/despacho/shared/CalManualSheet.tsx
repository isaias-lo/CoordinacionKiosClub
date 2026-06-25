'use client';

import { useState } from 'react';
import { X, Copy, Check, Calendar, ClipboardList } from 'lucide-react';
import { partsOf, buildManualText, type ManualLine, type CalendarStore } from './manualText';

export { partsOf, buildManualText };
export type { ManualLine, CalendarStore };

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;             // ej. "METROPOLITANA / COSTA" o "REGIONES"
  calendarStores: CalendarStore[];
  lines: ManualLine[];       // todo lo cargado en ESA pantalla
}

/**
 * Hoja inferior con dos pestañas, "a la mano" en Santiago y Regiones:
 *  - Calendario del día: tiendas del calendario central para ESA zona.
 *  - Manual: texto "COD: 2P - 1B" de lo cargado en ESA pantalla, con copiar.
 */
export function CalManualSheet({ open, onClose, title, calendarStores, lines }: Props) {
  const [tab, setTab]       = useState<'cal' | 'man'>('cal');
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const { text: manualText, withItems, tot } = buildManualText(lines);

  const copy = async () => {
    if (!manualText) return;
    try {
      await navigator.clipboard.writeText(manualText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard no disponible */ }
  };

  const TabBtn = ({ id, icon, label, count }: { id: 'cal' | 'man'; icon: React.ReactNode; label: string; count: number }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-card border-none font-barlow-condensed text-[15px] font-bold cursor-pointer transition-colors ${
        tab === id ? 'bg-navy text-white' : 'bg-bg-2 text-text-2'
      }`}
    >
      {icon}{label} <span className="opacity-70">({count})</span>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-navy/60 z-[500] flex items-end backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-t-[20px] px-4 pb-9 pt-5 w-full max-h-[85vh] overflow-y-auto"
        style={{ boxShadow: '0 -8px 40px rgba(26,37,80,0.2)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-bg-3 rounded-full mx-auto mb-4" />

        <div className="flex items-center justify-between mb-3">
          <h3 className="font-barlow-condensed text-[20px] font-bold text-navy tracking-wide">
            {title}
          </h3>
          <button onClick={onClose} className="bg-bg-2 text-text-2 rounded-full p-1.5 border-none cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <TabBtn id="cal" icon={<Calendar size={16} />}      label="Calendario del día" count={calendarStores.length} />
          <TabBtn id="man" icon={<ClipboardList size={16} />} label="Manual"             count={withItems.length} />
        </div>

        {tab === 'cal' ? (
          calendarStores.length === 0 ? (
            <p className="text-sm text-text-3 text-center py-8">No hay tiendas en el calendario para hoy.</p>
          ) : (
            <div className="border border-border rounded-[12px] overflow-hidden">
              {calendarStores.map(s => (
                <div key={s.cod} className="flex items-center px-3 py-2.5 border-b border-border last:border-b-0 text-[13px]">
                  <span className="font-mono text-[11px] text-text-3 bg-bg-2 border border-border-2 px-1.5 py-0.5 rounded mr-2">
                    {s.cod}
                  </span>
                  <span className="font-semibold text-text truncate">{s.nombre ?? ''}</span>
                </div>
              ))}
            </div>
          )
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-text-2">
                {withItems.length} tiendas · {partsOf(tot.p, tot.b, tot.c, tot.ch) || '0'}
              </span>
              <button
                onClick={copy}
                disabled={!manualText}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-navy text-white rounded-card border-none font-bold text-[13px] cursor-pointer disabled:opacity-40"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copiado' : 'Copiar todo'}
              </button>
            </div>
            <pre className="text-[13px] font-mono whitespace-pre-wrap bg-bg-2 rounded-[12px] p-3 text-text min-h-[80px]">
              {manualText || 'Sin items cargados en esta pantalla.'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
