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

// Print zone classification
const ZONA_NORTE_FAL = new Set(['41ANA','42ANP','39PSB','51SER']); // Antofagasta + La Serena
const RM_MALLS = new Set(['16PQA','20CTC','29CFL','52MUT','19SUB','45EST','49PTA']);

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

  /* ── Print ── */
  function handlePrint() {
    const falSet = new Set<string>();
    const costaSet = new Set<string>();
    const rmSet = new Set<string>();
    for (const dia of DIAS) {
      (local[dia]?.fal   || []).forEach(c => falSet.add(c));
      (local[dia]?.costa || []).forEach(c => costaSet.add(c));
      (local[dia]?.rm    || []).forEach(c => rmSet.add(c));
    }

    const sortByName = (a: string, b: string) =>
      (tiendas[a]?.n || a).localeCompare(tiendas[b]?.n || b, 'es');

    const falNorte  = [...falSet].filter(c =>  ZONA_NORTE_FAL.has(c)).sort(sortByName);
    const falSur    = [...falSet].filter(c => !ZONA_NORTE_FAL.has(c)).sort(sortByName);
    const costaList = [...costaSet].sort(sortByName);
    const rmMalls   = [...rmSet].filter(c =>  RM_MALLS.has(c)).sort(sortByName);
    const rmRegular = [...rmSet].filter(c => !RM_MALLS.has(c)).sort(sortByName);

    function daysFor(cod: string, grp: 'fal' | 'costa' | 'rm'): boolean[] {
      return DIAS.map(d => !!(local[d]?.[grp] || []).includes(cod));
    }

    function storeRow(cod: string, grp: 'fal' | 'costa' | 'rm', bg: string, accent: string): string {
      const days = daysFor(cod, grp);
      const name = tiendas[cod]?.n || cod;
      const shortCod = formatCod(cod);
      const cells = DIAS.map((_, i) =>
        days[i]
          ? `<td style="background:${accent};color:#fff;font-weight:bold;text-align:center;font-size:13px">✓</td>`
          : `<td style="background:#fff"></td>`
      ).join('');
      return `<tr>
        <td style="background:${bg};text-align:left;padding:3px 8px">
          <strong style="font-size:11px;color:#222">${shortCod}</strong>
          <span style="font-size:9px;color:#555;margin-left:4px">${name}</span>
        </td>${cells}
      </tr>`;
    }

    function sectionRow(title: string, color: string): string {
      return `<tr><td colspan="7" style="background:${color};color:#fff;font-weight:bold;font-size:12px;padding:6px 10px;letter-spacing:0.5px">${title}</td></tr>`;
    }

    function subRow(title: string, color: string): string {
      return `<tr><td colspan="7" style="background:${color};color:#fff;font-size:10px;padding:3px 10px">${title}</td></tr>`;
    }

    function emptyRow(): string {
      return `<tr><td colspan="7" style="color:#aaa;font-style:italic;font-size:10px;text-align:center;padding:4px">— sin tiendas asignadas —</td></tr>`;
    }

    const today = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

    const rows = [
      sectionRow('🏢 REGIONES — Bodega Regiones', '#1e3a5f'),
      subRow('Zona Norte · Antofagasta · La Serena', '#2563EB'),
      ...(falNorte.length ? falNorte.map(c => storeRow(c, 'fal', '#DBEAFE', '#2563EB')) : [emptyRow()]),
      subRow('Zona Sur · Macrozona Sur', '#B45309'),
      ...(falSur.length ? falSur.map(c => storeRow(c, 'fal', '#FEF9C3', '#D97706')) : [emptyRow()]),
      sectionRow('🌊 COSTA VALPARAÍSO — Bodega Santiago', '#065f46'),
      ...(costaList.length ? costaList.map(c => storeRow(c, 'costa', '#D1FAE5', '#059669')) : [emptyRow()]),
      sectionRow('📦 RM — Bodega Santiago', '#1f2937'),
      subRow('Tiendas RM', '#4B5563'),
      ...(rmRegular.length ? rmRegular.map(c => storeRow(c, 'rm', '#F3F4F6', '#4B5563')) : [emptyRow()]),
      ...(rmMalls.length ? [subRow('Malls RM', '#9D174D'), ...rmMalls.map(c => storeRow(c, 'rm', '#FCE7F3', '#DB2777'))] : []),
    ].join('\n');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Calendario de Despacho</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; margin: 16px; }
    h1 { font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 4px; }
    .subtitle { text-align: center; font-size: 10px; color: #777; margin-bottom: 10px; }
    .legend { display: flex; gap: 14px; justify-content: center; margin-bottom: 12px; flex-wrap: wrap; }
    .leg-item { display: flex; align-items: center; gap: 5px; font-size: 10px; color: #444; }
    .leg-dot { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #111A3E; color: #fff; font-weight: bold; padding: 6px 8px; border: 1px solid #bbb; text-align: center; }
    th.store-col { text-align: left; min-width: 200px; }
    th.day-col { min-width: 72px; }
    td { border: 1px solid #ddd; padding: 3px 4px; }
    @media print {
      @page { size: A4 landscape; margin: 0.8cm; }
      body { margin: 0; font-size: 10px; }
    }
  </style>
</head>
<body>
  <h1>Calendario de Despacho — KiosClub</h1>
  <p class="subtitle">Impreso el ${today}</p>
  <div class="legend">
    <div class="leg-item"><div class="leg-dot" style="background:#2563EB"></div>Zona Norte (Regiones)</div>
    <div class="leg-item"><div class="leg-dot" style="background:#D97706"></div>Zona Sur (Regiones)</div>
    <div class="leg-item"><div class="leg-dot" style="background:#059669"></div>Costa Valparaíso</div>
    <div class="leg-item"><div class="leg-dot" style="background:#4B5563"></div>RM</div>
    <div class="leg-item"><div class="leg-dot" style="background:#DB2777"></div>Malls RM</div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="store-col">Tienda</th>
        <th class="day-col">Lunes</th>
        <th class="day-col">Martes</th>
        <th class="day-col">Miércoles</th>
        <th class="day-col">Jueves</th>
        <th class="day-col">Viernes</th>
        <th class="day-col">Sábado</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=1100,height=750');
    if (!win) {
      alert('El navegador bloqueó la ventana emergente. Permite las ventanas emergentes para esta página e intenta de nuevo.');
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  }

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

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="h-[40px] px-4 rounded-full text-[14px] font-bold border-2 transition-all bg-white border-black/[0.12] text-knavy hover:border-knavy/[0.4] flex items-center gap-1.5">
            🖨 Imprimir
          </button>
          <button
            onClick={() => onSave(local)}
            disabled={saveStatus === 'saving' || !hasChanges}
            className={`h-[40px] px-5 rounded-full text-[14px] font-bold border-2 transition-all
              ${saveStatus === 'success' ? 'bg-[#25A244] border-[#25A244] text-white'
              : saveStatus === 'error'   ? 'bg-kred border-kred text-white'
              : hasChanges               ? 'bg-kred border-kred text-white shadow-md shadow-red-200'
              : 'bg-kbg border-black/[0.10] text-kmuted cursor-not-allowed opacity-60'}`}>
            {saveLabel}
          </button>
        </div>
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
