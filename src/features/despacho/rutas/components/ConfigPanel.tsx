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

        {/* ── Header ── */}
        <div className="bg-kred px-5 py-5 flex items-start justify-between sticky top-0 z-10">
          <div>
            <div className="text-[11px] font-semibold text-white/60 uppercase tracking-[1.2px] mb-1">Configuración</div>
            <div className="text-[22px] font-extrabold text-white leading-tight">Calendario de despacho</div>
            <div className="text-[13px] text-white/70 mt-1">Arrastra tiendas entre días · ✕ para quitar</div>
          </div>
          <button onClick={onClose}
            className="w-[34px] h-[34px] rounded-[9px] bg-white/[0.18] text-white text-[15px] flex items-center justify-center hover:bg-white/[0.28] transition-all mt-0.5">
            ✕
          </button>
        </div>

        {/* ── Selector de grupo ── */}
        <div className="px-5 pt-4 pb-3 flex gap-2 flex-wrap border-b border-black/[0.07]">
          {GRUPOS.map(([id, lb]) => (
            <button
              key={id}
              onClick={() => setCfgGrp(id)}
              className={`h-[40px] px-5 rounded-full text-[14px] font-bold border-2 transition-all
                ${cfgGrp === id ? 'bg-kred border-kred text-white shadow-md shadow-red-200' : 'bg-white border-black/[0.12] text-kmuted hover:border-kred/[0.3]'}`}
            >
              {lb}
            </button>
          ))}
        </div>

        {/* ── Buscador ── */}
        <div className="px-5 py-3 border-b border-black/[0.07]">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] pointer-events-none">🔍</span>
            <input
              type="text" value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Buscar tienda para agregar..."
              className="w-full h-[42px] pl-10 pr-4 rounded-[10px] border-[1.5px] border-black/[0.10] bg-kbg text-[14px] text-ktext focus:border-kred focus:outline-none"
            />
            {showSug && (
              <div className="absolute top-[46px] left-0 right-0 bg-white border-[1.5px] border-black/[0.09] rounded-[10px] shadow-[0_8px_24px_rgba(0,0,0,0.14)] z-[999] max-h-[260px] overflow-y-auto">
                {suggest.map(c => {
                  const inf = tiendas[c];
                  const yaEsta = DIAS.some(d => cfgTmp[d]?.[cfgGrp as 'rm'|'costa'|'fal']?.includes(c));
                  return (
                    <div
                      key={c}
                      onClick={() => handleAgregar(c)}
                      className="px-4 py-3 cursor-pointer border-b border-black/[0.07] last:border-0 flex items-center justify-between hover:bg-kbg transition-colors"
                    >
                      <div>
                        <span className="font-mono font-bold text-kred text-[15px]">{formatCod(c)}</span>
                        <span className="text-[13px] text-ktext ml-2">{inf?.n || ''}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {yaEsta && <span className="text-[12px] text-kmuted italic">ya existe</span>}
                        <span className="w-[26px] h-[26px] rounded-full bg-kred text-white text-[16px] font-bold flex items-center justify-center">+</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Días ── */}
        <div className="px-5 py-4 flex-1 lg:grid lg:grid-cols-2 lg:gap-x-5 lg:content-start">
          {DIAS.map(dia => {
            const ts = cfgTmp[dia]?.[cfgGrp as 'rm'|'costa'|'fal'] || [];
            return (
              <div key={dia} className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[16px] font-bold" style={{ color: dcol[dia] }}>{dnom[dia]}</span>
                  <span className="text-[13px] text-kmuted font-medium">{ts.length} tienda{ts.length !== 1 ? 's' : ''}</span>
                </div>
                <div
                  onDragOver={e => { onDragOver(e); e.currentTarget.classList.add('border-kred','bg-kred/[0.04]'); }}
                  onDragLeave={e => e.currentTarget.classList.remove('border-kred','bg-kred/[0.04]')}
                  onDrop={e => { e.currentTarget.classList.remove('border-kred','bg-kred/[0.04]'); onDrop(e, dia); }}
                  className="min-h-[52px] bg-kbg rounded-[10px] border-2 border-dashed border-black/[0.10] p-2 flex flex-wrap gap-1.5 transition-all"
                >
                  {ts.map(cod => (
                    <div
                      key={cod}
                      draggable
                      onDragStart={e => onDragStart(e, dia, cod)}
                      className="h-8 px-2.5 rounded-[7px] bg-white border-[1.5px] border-black/[0.10] font-mono text-[13px] font-bold text-ktext cursor-grab flex items-center gap-1.5 shadow-sm select-none hover:border-kred/[0.4] transition-colors"
                    >
                      {formatCod(cod)}
                      <span
                        onClick={() => cfgRm(dia, cod)}
                        className="text-kmuted text-[12px] cursor-pointer hover:text-kred transition-colors"
                      >✕</span>
                    </div>
                  ))}
                  {ts.length === 0 && (
                    <span className="text-[12px] text-black/[0.20] italic self-center px-1">Sin tiendas asignadas</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-4 border-t border-black/[0.09] flex gap-3 sticky bottom-0 bg-white">
          <button onClick={handleSave}
            className="flex-1 h-[48px] rounded-[12px] bg-kred text-white text-[16px] font-bold shadow-md shadow-red-200/50">
            Guardar cambios
          </button>
          <button onClick={onClose}
            className="h-[48px] px-5 rounded-[12px] bg-kbg text-kmuted text-[15px] font-semibold border border-black/[0.09]">
            Cancelar
          </button>
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
