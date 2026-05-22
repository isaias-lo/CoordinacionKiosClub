'use client';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatCod } from '@/features/despacho/rutas/utils/helpers';
import type { TiendaInfo } from '@/features/despacho/rutas/data/tiendas';

const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
const DNOM: Record<string, string> = { LU: 'Lunes', MA: 'Martes', MI: 'Miércoles', JU: 'Jueves', VI: 'Viernes', SA: 'Sábado' };
const DCOL: Record<string, string> = { LU: '#007AFF', MA: '#34C759', MI: '#FF9500', JU: '#AF52DE', VI: '#FF2D55', SA: '#5AC8FA' };

const GRUPOS: [string, string, string][] = [
  ['rm',    '📦 RM',       'Bodega Santiago (RM)'],
  ['costa', '🌊 Costa',    'Bodega Santiago (Costa V Región)'],
  ['fal',   '🏢 Regiones', 'Bodega Regiones'],
];

// Mirrors classification logic from useCalendario.ts
const COSTA_CODES = new Set(['37VIN','08RNC','33CON','43CUR','54MPQ']);
const FAL_CODES   = new Set(['46TRE','28TEM','75PUC','53VAL','47PTV','50PTM','39PSB','41ANA','42ANP','31TLC','36CHL','24SPP','38SP2','76PAN','51SER','27MCH']);

function storeGroup(cod: string): 'rm' | 'costa' | 'fal' {
  if (COSTA_CODES.has(cod)) return 'costa';
  if (FAL_CODES.has(cod))   return 'fal';
  return 'rm';
}

type CalRecord = Record<string, { rm: string[]; costa: string[]; fal: string[] }>;

interface Props {
  cal: CalRecord;
  tiendas: Record<string, TiendaInfo>;
  saveStatus: 'idle' | 'saving' | 'success' | 'error';
  onSave: (cal: CalRecord) => void;
}

export default function CalendarioCentral({ cal, tiendas, saveStatus, onSave }: Props) {
  const [local, setLocal]     = useState<CalRecord>(() => JSON.parse(JSON.stringify(cal)));
  const [grp, setGrp]         = useState('rm');
  const [search, setSearch]   = useState('');
  const [suggest, setSuggest] = useState<string[]>([]);
  const [showSug, setShowSug] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCod, setPickerCod]   = useState('');
  const ddRef = useRef<{ dia: string | null; cod: string | null }>({ dia: null, cod: null });

  // Sync local when parent cal changes (after a successful save)
  useEffect(() => {
    setLocal(JSON.parse(JSON.stringify(cal)));
  }, [cal]);

  const hasChanges = JSON.stringify(local) !== JSON.stringify(cal);

  /* ── Store search ── */
  function handleSearch(q: string) {
    setSearch(q);
    const qup = q.trim().toUpperCase();
    if (!qup) { setSuggest([]); setShowSug(false); return; }
    const res = Object.keys(tiendas).filter(c => {
      if (storeGroup(c) !== grp) return false; // solo tiendas del grupo activo
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
    setLocal(prev => {
      const next: CalRecord = JSON.parse(JSON.stringify(prev));
      if (!next[dia]) next[dia] = { rm: [], costa: [], fal: [] };
      const g = grp as 'rm' | 'costa' | 'fal';
      if (!next[dia][g]) next[dia][g] = [];
      if (!next[dia][g].includes(cod)) next[dia][g].push(cod);
      return next;
    });
    setPickerOpen(false);
    setPickerCod('');
  }

  /* ── Remove store ── */
  function cfgRm(dia: string, cod: string) {
    setLocal(prev => {
      const next: CalRecord = JSON.parse(JSON.stringify(prev));
      const a = next[dia]?.[grp as 'rm' | 'costa' | 'fal'];
      if (a) { const i = a.indexOf(cod); if (i >= 0) a.splice(i, 1); }
      return next;
    });
  }

  /* ── Drag & drop ── */
  function onDragStart(e: React.DragEvent, dia: string, cod: string) {
    ddRef.current = { dia, cod };
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDrop(e: React.DragEvent, targetDia: string) {
    e.preventDefault();
    const { dia: srcDia, cod } = ddRef.current;
    if (!cod || srcDia === targetDia) return;
    setLocal(prev => {
      const next: CalRecord = JSON.parse(JSON.stringify(prev));
      const src = next[srcDia!]?.[grp as 'rm' | 'costa' | 'fal'];
      const dst = next[targetDia]?.[grp as 'rm' | 'costa' | 'fal'];
      if (!src || !dst) return prev;
      const idx = src.indexOf(cod);
      if (idx >= 0) { src.splice(idx, 1); if (!dst.includes(cod)) dst.push(cod); }
      return next;
    });
  }

  const grpInfo = GRUPOS.find(g => g[0] === grp);
  const saveLabel = saveStatus === 'saving'  ? '⏳ Guardando...'
    : saveStatus === 'success' ? '✓ Guardado en Sheets'
    : saveStatus === 'error'   ? '⚠ Error al guardar'
    : hasChanges               ? 'Guardar cambios'
    : 'Sin cambios';

  return (
    <div className="max-w-[780px] mx-auto px-4 py-5 pb-10">

      {/* ── Banner informativo ── */}
      <div className="bg-knavy/[0.07] border border-knavy/[0.18] rounded-[12px] px-4 py-3 mb-5 flex gap-3 items-start">
        <span className="text-[18px] flex-shrink-0 mt-0.5">📅</span>
        <div className="text-[13px] text-ktext leading-relaxed">
          <strong className="text-knavy">Calendario Central.</strong>{' '}
          Los cambios aquí se propagan automáticamente a{' '}
          <span className="font-semibold">Bodega Santiago, Bodega Regiones, Enrutador y Picking</span>.
          RM y Costa siempre van a Bodega Santiago · Regiones siempre va a Bodega Regiones.
        </div>
      </div>

      {/* ── Grupo tabs + Guardar ── */}
      <div className="flex flex-wrap gap-2 mb-1 items-center">
        {GRUPOS.map(([id, lb]) => (
          <button key={id} onClick={() => { setGrp(id); setSearch(''); setSuggest([]); setShowSug(false); }}
            className={`h-[40px] px-5 rounded-full text-[14px] font-bold border-2 transition-all
              ${grp === id
                ? 'bg-kred border-kred text-white shadow-md shadow-red-200'
                : 'bg-white border-black/[0.12] text-kmuted hover:border-kred/[0.3]'}`}>
            {lb}
          </button>
        ))}

        <button
          onClick={() => onSave(local)}
          disabled={saveStatus === 'saving' || !hasChanges}
          className={`ml-auto h-[40px] px-5 rounded-full text-[14px] font-bold border-2 transition-all
            ${saveStatus === 'success' ? 'bg-[#25A244] border-[#25A244] text-white'
            : saveStatus === 'error'   ? 'bg-kred border-kred text-white'
            : hasChanges               ? 'bg-kred border-kred text-white shadow-md shadow-red-200'
            : 'bg-kbg border-black/[0.10] text-kmuted cursor-not-allowed opacity-60'}`}>
          {saveLabel}
        </button>
      </div>

      {grpInfo && (
        <div className="text-[12px] text-kmuted mb-5 pl-1">{grpInfo[2]}</div>
      )}

      {/* ── Buscador ── */}
      <div className="relative mb-6">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] pointer-events-none">🔍</span>
        <input
          type="text" value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder={`Buscar tienda para agregar al grupo ${grpInfo?.[1] || ''}...`}
          className="w-full h-[44px] pl-10 pr-4 rounded-[12px] border-[1.5px] border-black/[0.10] bg-white text-[14px] text-ktext focus:border-kred focus:outline-none shadow-sm"
        />
        {showSug && (
          <div className="absolute top-[48px] left-0 right-0 bg-white border-[1.5px] border-black/[0.09] rounded-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.14)] z-[50] max-h-[260px] overflow-y-auto">
            {suggest.map(c => {
              const inf = tiendas[c];
              const yaEsta = DIAS.some(d => local[d]?.[grp as 'rm' | 'costa' | 'fal']?.includes(c));
              return (
                <div key={c} onClick={() => handleAgregar(c)}
                  className="px-4 py-3 cursor-pointer border-b border-black/[0.07] last:border-0 flex items-center justify-between hover:bg-kbg transition-colors">
                  <div>
                    <span className="font-mono font-bold text-kred text-[15px]">{formatCod(c)}</span>
                    <span className="text-[13px] text-ktext ml-2">{inf?.n || ''}</span>
                    <span className="text-[11px] text-kmuted ml-2">{inf?.z || ''}</span>
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

      {/* ── Grid de días ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {DIAS.map(dia => {
          const ts = local[dia]?.[grp as 'rm' | 'costa' | 'fal'] || [];
          return (
            <div key={dia}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[16px] font-bold" style={{ color: DCOL[dia] }}>{DNOM[dia]}</span>
                <span className="text-[13px] text-kmuted font-medium">{ts.length} tienda{ts.length !== 1 ? 's' : ''}</span>
              </div>
              <div
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-kred', 'bg-kred/[0.04]'); }}
                onDragLeave={e => e.currentTarget.classList.remove('border-kred', 'bg-kred/[0.04]')}
                onDrop={e => { e.currentTarget.classList.remove('border-kred', 'bg-kred/[0.04]'); onDrop(e, dia); }}
                className="min-h-[56px] bg-white rounded-[12px] border-2 border-dashed border-black/[0.10] p-2.5 flex flex-wrap gap-1.5 transition-all shadow-sm"
              >
                {ts.map(cod => (
                  <div
                    key={cod} draggable
                    onDragStart={e => onDragStart(e, dia, cod)}
                    title={tiendas[cod]?.n || cod}
                    className="h-8 px-2.5 rounded-[7px] bg-kbg border-[1.5px] border-black/[0.10] font-mono text-[13px] font-bold text-ktext cursor-grab flex items-center gap-1.5 shadow-sm select-none hover:border-kred/[0.4] transition-colors"
                  >
                    {formatCod(cod)}
                    <span onClick={() => cfgRm(dia, cod)}
                      className="text-kmuted text-[12px] cursor-pointer hover:text-kred transition-colors">✕</span>
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

      {/* ── Day picker modal ── */}
      {pickerOpen && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/[0.45] backdrop-blur-sm flex items-center justify-center"
          onClick={e => { if (e.target === e.currentTarget) { setPickerOpen(false); setPickerCod(''); } }}
        >
          <div className="bg-white rounded-[18px] p-[22px] w-[min(300px,88%)] shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
            <div className="text-[13px] font-bold text-ktext mb-1">
              Agregar <span className="text-kred">{formatCod(pickerCod)}</span>
              {tiendas[pickerCod] ? ' — ' + tiendas[pickerCod].n : ''}
            </div>
            <div className="text-[12px] text-kmuted mb-3.5">Selecciona el día:</div>
            <div className="grid grid-cols-3 gap-2 mb-3.5">
              {DIAS.map(d => {
                const yaEsta = local[d]?.[grp as 'rm' | 'costa' | 'fal']?.includes(pickerCod);
                return (
                  <button key={d} onClick={() => handlePickerConfirm(pickerCod, d)}
                    className="h-[38px] rounded-[9px] text-[13px] font-semibold border-2 transition-all cursor-pointer"
                    style={{
                      borderColor: yaEsta ? '#C7C7CC' : DCOL[d],
                      color:       yaEsta ? '#8E8E93' : DCOL[d],
                      background:  yaEsta ? '#F2F2F7' : 'transparent',
                      opacity:     yaEsta ? 0.7 : 1,
                    }}>
                    {DNOM[d]}{yaEsta ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => { setPickerOpen(false); setPickerCod(''); }}
              className="w-full h-[38px] rounded-[9px] bg-kbg text-kmuted text-[13px] font-semibold border-[1.5px] border-black/[0.09]">
              Cancelar
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
