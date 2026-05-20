'use client';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatCod } from '../utils/helpers';
import type { TiendaInfo } from '../data/tiendas';

const DIAS = ['LU','MA','MI','JU','VI','SA'];
const GRUPOS: [string, string][] = [
  ['rm',    '📦 Flota'],
  ['fal',   '🏢 Regiones'],
  ['costa', '🌊 Costa'],
];

type CalRecord = Record<string, { rm: string[]; costa: string[]; fal: string[] }>;

interface Props {
  isOpen: boolean;
  cal: CalRecord;
  tiendas: Record<string, TiendaInfo>;
  dnom: Record<string, string>;
  dcol: Record<string, string>;
  onClose: () => void;
  onSave: (cal: CalRecord) => void;
}

export default function ConfigPanel({ isOpen, cal, tiendas, dnom, dcol, onClose, onSave }: Props) {
  const [cfgTmp,  setCfgTmp]  = useState<CalRecord>(() => JSON.parse(JSON.stringify(cal)));
  const [cfgGrp,  setCfgGrp]  = useState('rm');
  const [search,  setSearch]  = useState('');
  const [suggest, setSuggest] = useState<string[]>([]);
  const [showSug, setShowSug] = useState(false);
  const ddRef = useRef<{ dia: string | null; cod: string | null }>({ dia: null, cod: null });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCod,  setPickerCod]  = useState('');

  useEffect(() => {
    if (isOpen) setCfgTmp(JSON.parse(JSON.stringify(cal)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function handleSave() { onSave(cfgTmp); }

  function cfgRm(dia: string, cod: string) {
    setCfgTmp(prev => {
      const next: CalRecord = JSON.parse(JSON.stringify(prev));
      const a = next[dia]?.[cfgGrp as 'rm'|'costa'|'fal'];
      if (a) { const i = a.indexOf(cod); if (i >= 0) a.splice(i, 1); }
      return next;
    });
  }

  function onDragStart(e: React.DragEvent, dia: string, cod: string) {
    ddRef.current = { dia, cod };
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e: React.DragEvent) { e.preventDefault(); }

  function onDrop(e: React.DragEvent, targetDia: string) {
    e.preventDefault();
    const { dia: srcDia, cod } = ddRef.current;
    if (!cod || srcDia === targetDia) return;
    setCfgTmp(prev => {
      const next: CalRecord = JSON.parse(JSON.stringify(prev));
      const src = next[srcDia!]?.[cfgGrp as 'rm'|'costa'|'fal'];
      const dst = next[targetDia]?.[cfgGrp as 'rm'|'costa'|'fal'];
      if (!src || !dst) return prev;
      const idx = src.indexOf(cod);
      if (idx >= 0) { src.splice(idx, 1); if (!dst.includes(cod)) dst.push(cod); }
      return next;
    });
  }

  function handleSearch(q: string) {
    setSearch(q);
    const qup = q.trim().toUpperCase();
    if (!qup) { setSuggest([]); setShowSug(false); return; }
    const res = Object.keys(tiendas).filter(c => {
      const nombre = (tiendas[c].n || '').toUpperCase();
      return c.indexOf(qup) >= 0 || nombre.indexOf(qup) >= 0;
    }).slice(0, 8);
    setSuggest(res);
    setShowSug(res.length > 0);
  }

  function handleAgregar(cod: string) {
    setSearch(''); setSuggest([]); setShowSug(false);
    setPickerCod(cod);
    setPickerOpen(true);
  }

  function handlePickerConfirm(cod: string, dia: string) {
    setCfgTmp(prev => {
      const next: CalRecord = JSON.parse(JSON.stringify(prev));
      if (!next[dia]) next[dia] = { rm: [], costa: [], fal: [] };
      const grp = cfgGrp as 'rm'|'costa'|'fal';
      if (!next[dia][grp]) next[dia][grp] = [];
      if (!next[dia][grp].includes(cod)) next[dia][grp].push(cod);
      return next;
    });
    setPickerOpen(false);
    setPickerCod('');
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/[0.42] z-[900] backdrop-blur-sm"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      />

      <div className={`fixed top-0 right-0 w-[min(390px,100%)] lg:w-[620px] h-full bg-white z-[901] overflow-y-auto flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.14)] transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="bg-kred px-[18px] py-[18px] flex items-start justify-between sticky top-0 z-10">
          <div>
            <div className="text-[10px] font-semibold text-white/70 uppercase tracking-[1px]">CONFIGURACIÓN</div>
            <div className="text-[17px] font-bold text-white mt-0.5">Calendario de despacho</div>
            <div className="text-[12px] text-white/70 mt-0.5 leading-snug">Arrastra tiendas entre días o quítalas con ✕</div>
          </div>
          <button onClick={onClose} className="w-[30px] h-[30px] rounded-[7px] bg-white/[0.18] text-white text-[13px] flex items-center justify-center">✕</button>
        </div>

        <div className="px-4 py-3.5 flex gap-[8px] flex-wrap">
          {GRUPOS.map(([id, lb]) => (
            <button
              key={id}
              onClick={() => setCfgGrp(id)}
              className={`h-[38px] px-4 rounded-full text-[14px] font-bold border-[2px] transition-all shadow-md hover:shadow-lg
                ${cfgGrp === id ? 'bg-kred border-kred text-white shadow-red-200' : 'bg-white border-black/[0.12] text-kmuted hover:border-kred/[0.3]'}`}
            >
              {lb}
            </button>
          ))}
        </div>

        <div className="px-4 pb-2.5">
          <div className="relative">
            <input
              type="text" value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="🔍 Buscar tienda para agregar..."
              className="w-full h-[38px] px-3 rounded-[8px] border-[1.5px] border-black/[0.09] bg-kbg text-[13px] font-sans text-ktext focus:border-kred focus:outline-none"
            />
            {showSug && (
              <div className="absolute top-[42px] left-0 right-0 bg-white border-[1.5px] border-black/[0.09] rounded-[8px] shadow-[0_4px_16px_rgba(0,0,0,0.12)] z-[999] max-h-[220px] overflow-y-auto">
                {suggest.map(c => {
                  const inf = tiendas[c];
                  const yaEsta = DIAS.some(d => cfgTmp[d]?.[cfgGrp as 'rm'|'costa'|'fal']?.includes(c));
                  return (
                    <div
                      key={c}
                      onClick={() => handleAgregar(c)}
                      className="px-3.5 py-2.5 cursor-pointer border-b border-black/[0.09] last:border-0 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div>
                        <span className="font-mono font-bold text-kred text-[13px]">{formatCod(c)}</span>
                        <span className="text-[12px] text-ktext2 ml-2">{inf?.n || ''}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {yaEsta && <span className="text-[10px] text-kmuted">ya existe</span>}
                        <span className="w-[22px] h-[22px] rounded-full bg-kred text-white text-[14px] font-bold flex items-center justify-center">+</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 pb-6 flex-1 lg:grid lg:grid-cols-2 lg:gap-x-4 lg:content-start">
          {DIAS.map(dia => {
            const ts = cfgTmp[dia]?.[cfgGrp as 'rm'|'costa'|'fal'] || [];
            return (
              <div key={dia} className="mb-3">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[13px] font-bold" style={{ color: dcol[dia] }}>{dnom[dia]}</span>
                  <span className="text-[11px] text-kmuted">{ts.length} tiendas</span>
                </div>
                <div
                  onDragOver={e => { onDragOver(e); e.currentTarget.classList.add('border-kred','bg-kred/[0.04]'); }}
                  onDragLeave={e => e.currentTarget.classList.remove('border-kred','bg-kred/[0.04]')}
                  onDrop={e => { e.currentTarget.classList.remove('border-kred','bg-kred/[0.04]'); onDrop(e, dia); }}
                  className="min-h-[40px] bg-kbg rounded-kios2 border-2 border-dashed border-black/[0.09] p-1.5 flex flex-wrap gap-[5px] transition-all"
                >
                  {ts.map(cod => (
                    <div
                      key={cod}
                      draggable
                      onDragStart={e => onDragStart(e, dia, cod)}
                      className="h-7 px-2 rounded-[6px] bg-white border-[1.5px] border-black/[0.09] font-mono text-[11px] font-bold text-ktext cursor-grab flex items-center gap-[5px] shadow-sm select-none"
                    >
                      {formatCod(cod)}
                      <span
                        onClick={() => cfgRm(dia, cod)}
                        className="text-kmuted text-[10px] cursor-pointer px-px font-normal hover:text-kred"
                      >✕</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-3.5 border-t border-black/[0.09] flex gap-[9px] sticky bottom-0 bg-white">
          <button onClick={handleSave} className="flex-1 h-[44px] rounded-kios2 bg-kred text-white text-[15px] font-bold">Guardar cambios</button>
          <button onClick={onClose}   className="h-[44px] px-4 rounded-kios2 bg-kbg text-kmuted text-[14px] font-semibold">Cancelar</button>
        </div>
      </div>

      {pickerOpen && createPortal(
        <DayPickerModal
          cod={pickerCod}
          tiendas={tiendas}
          cfgTmp={cfgTmp}
          cfgGrp={cfgGrp}
          dnom={dnom}
          dcol={dcol}
          onClose={() => { setPickerOpen(false); setPickerCod(''); }}
          onConfirm={handlePickerConfirm}
        />,
        document.body
      )}
    </>
  );
}

function DayPickerModal({ cod, tiendas, cfgTmp, cfgGrp, dnom, dcol, onClose, onConfirm }: {
  cod: string;
  tiendas: Record<string, TiendaInfo>;
  cfgTmp: CalRecord;
  cfgGrp: string;
  dnom: Record<string, string>;
  dcol: Record<string, string>;
  onClose: () => void;
  onConfirm: (cod: string, dia: string) => void;
}) {
  const inf = tiendas[cod];
  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/[0.45] backdrop-blur-sm flex items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-[18px] p-[22px] w-[min(300px,88%)] shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
        <div className="text-[13px] font-bold text-ktext mb-1">
          Agregar <span className="text-kred">{formatCod(cod)}</span>
          {inf ? ' — ' + inf.n : ''}
        </div>
        <div className="text-[12px] text-kmuted mb-3.5">
          Selecciona el día al que quieres agregar esta tienda:
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3.5">
          {DIAS.map(d => {
            const yaEsta = cfgTmp[d]?.[cfgGrp as 'rm'|'costa'|'fal']?.includes(cod);
            return (
              <button
                key={d}
                onClick={() => onConfirm(cod, d)}
                className="h-[38px] rounded-[9px] text-[13px] font-semibold border-2 transition-all cursor-pointer"
                style={{
                  borderColor: yaEsta ? 'var(--border)' : dcol[d],
                  color:       yaEsta ? '#8E8E93' : dcol[d],
                  background:  yaEsta ? '#F2F2F7' : 'transparent',
                  opacity:     yaEsta ? 0.7 : 1,
                }}
              >
                {dnom[d]}{yaEsta ? ' ✓' : ''}
              </button>
            );
          })}
        </div>
        <button
          onClick={onClose}
          className="w-full h-[38px] rounded-[9px] bg-kbg text-kmuted text-[13px] font-semibold border-[1.5px] border-black/[0.09]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
