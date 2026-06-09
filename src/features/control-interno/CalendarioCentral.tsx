'use client';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatCod } from '@/features/despacho/rutas/utils/helpers';
import type { TiendaInfo } from '@/features/despacho/rutas/data/tiendas';

const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
const DNOM: Record<string, string> = { LU: 'Lunes', MA: 'Martes', MI: 'Miércoles', JU: 'Jueves', VI: 'Viernes', SA: 'Sábado' };
const DCOL: Record<string, string> = { LU: '#007AFF', MA: '#34C759', MI: '#FF9500', JU: '#AF52DE', VI: '#FF2D55', SA: '#5AC8FA' };

const GRUPOS: [string, string, string][] = [
  ['general', '🗂 General', 'Vista completa — Regiones → Costa → RM'],
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

    // Preserve insertion order (= screen order) — no alphabetical sort
    const falSur    = [...falSet].filter(c => !ZONA_NORTE_FAL.has(c));
    const falNorte  = [...falSet].filter(c =>  ZONA_NORTE_FAL.has(c));
    const costaList = [...costaSet];
    const rmAll     = [...rmSet]; // malls and regular combined, as shown on screen

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

    function emptyRow(): string {
      return `<tr><td colspan="7" style="color:#aaa;font-style:italic;font-size:10px;text-align:center;padding:4px">— sin tiendas asignadas —</td></tr>`;
    }

    const today = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

    const rows = [
      sectionRow('🏢 REGIONES (SUR) — Bodega Regiones', '#7B4F00'),
      ...(falSur.length   ? falSur.map(c   => storeRow(c, 'fal',   '#FFF3CD', '#D4A017')) : [emptyRow()]),
      sectionRow('🏢 REGIONES (NORTE) — Bodega Regiones', '#1e3a5f'),
      ...(falNorte.length ? falNorte.map(c => storeRow(c, 'fal',   '#FFFDE7', '#F59E0B')) : [emptyRow()]),
      sectionRow('🌊 RUTA V REGIÓN — Bodega Santiago', '#0369A1'),
      ...(costaList.length ? costaList.map(c => storeRow(c, 'costa', '#DBEAFE', '#0284C7')) : [emptyRow()]),
      sectionRow('📦 RM — Bodega Santiago', '#1f2937'),
      ...(rmAll.length ? rmAll.map(c => storeRow(c, 'rm',
        RM_MALLS.has(c) ? '#FFE4EC' : '#F9FAFB',
        RM_MALLS.has(c) ? '#DB2777' : '#6B7280',
      )) : [emptyRow()]),
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
  <p class="subtitle">Impreso el ${today} · Orden: Regiones Sur → Regiones Norte → V Región → RM · Malls</p>
  <div class="legend">
    <div class="leg-item"><div class="leg-dot" style="background:#D4A017"></div>Regiones (Sur)</div>
    <div class="leg-item"><div class="leg-dot" style="background:#F59E0B"></div>Regiones (Norte)</div>
    <div class="leg-item"><div class="leg-dot" style="background:#0284C7"></div>Ruta V Región (Costa)</div>
    <div class="leg-item"><div class="leg-dot" style="background:#6B7280"></div>RM</div>
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
      const idx = next[dia][g].indexOf(cod);
      if (idx >= 0) next[dia][g].splice(idx, 1);
      else next[dia][g].push(cod);
      return next;
    });
    // keep modal open for multi-day selection
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

  // ── Store type classification (misma lógica que CalendarioArmado) ──
  type StoreType = 'mall' | 'street' | 'costa' | 'region';
  const TYPE_STYLE: Record<StoreType, { bg: string; text: string; border: string; label: string; shadow: string }> = {
    mall:   { bg: '#EDE9FE', text: '#5B21B6', border: '#C4B5FD', label: 'MALL',          shadow: 'rgba(91,33,182,0.16)'  },
    street: { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD', label: 'STREET CENTER', shadow: 'rgba(29,78,216,0.16)'  },
    costa:  { bg: '#CCFBF1', text: '#0F766E', border: '#5EEAD4', label: 'COSTA',         shadow: 'rgba(15,118,110,0.16)' },
    region: { bg: '#FFEDD5', text: '#C2410C', border: '#FDBA74', label: 'REGIÓN',        shadow: 'rgba(194,65,12,0.16)'  },
  };
  function getTipo(cod: string): StoreType {
    const inf = tiendas[cod];
    if (!inf) return 'street';
    if (inf.z === 'Región') return 'region';
    if (inf.z === 'Costa')  return 'costa';
    if (inf.v && /local/i.test(inf.v)) return 'mall';
    return 'street';
  }
  const DLIGHT: Record<string, string> = { LU: '#EBF4FF', MA: '#EDFFF4', MI: '#FFF8ED', JU: '#F5EFFE', VI: '#FFEBEE', SA: '#E5FFFE' };

  const grpInfo = GRUPOS.find(g => g[0] === grp);
  const saveLabel = saveStatus === 'saving'  ? '⏳ Guardando...'
    : saveStatus === 'success' ? '✓ Guardado en Sheets'
    : saveStatus === 'error'   ? '⚠ Error al guardar'
    : hasChanges               ? 'Guardar cambios'
    : 'Sin cambios';

  return (
    <div style={{ background: '#F2F2F7', borderRadius: 20, padding: '20px 16px 24px', maxWidth: 820, margin: '0 auto' }}>

      {/* ── Banner informativo ── */}
      <div style={{
        background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 14,
        padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>📅</span>
        <div style={{ fontSize: 13, color: '#3C3C43', lineHeight: 1.6 }}>
          <strong style={{ color: '#C12828' }}>Calendario Central.</strong>{' '}
          Los cambios aquí se propagan automáticamente a{' '}
          <strong>Bodega Santiago, Bodega Regiones, Enrutador y Picking</strong>.
          RM y Costa siempre van a Bodega Santiago · Regiones siempre va a Bodega Regiones.
        </div>
      </div>

      {/* ── Grupo tabs + Guardar ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        {GRUPOS.map(([id, lb]) => {
          const active = grp === id;
          const parts = lb.split(' ');
          const icon = parts[0];
          const label = parts.slice(1).join(' ');
          return (
            <button key={id}
              onClick={() => { setGrp(id); setSearch(''); setSuggest([]); setShowSug(false); }}
              style={{
                height: 42, padding: '0 18px', borderRadius: 100,
                fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                background: active
                  ? 'linear-gradient(175deg, #E53535 0%, #C12828 100%)'
                  : '#FFFFFF',
                color: active ? '#FFFFFF' : '#1C1C1E',
                boxShadow: active
                  ? '0 4px 18px rgba(193,40,40,0.38), 0 1px 0 rgba(255,255,255,0.2) inset'
                  : '0 2px 8px rgba(0,0,0,0.09), 0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.95)',
                transition: 'all 0.17s cubic-bezier(0.34,1.56,0.64,1)',
              }}>
              <span style={{ fontSize: 17, lineHeight: 1 }}>{icon}</span>
              {label}
            </button>
          );
        })}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handlePrint}
            style={{
              height: 42, padding: '0 18px', borderRadius: 100,
              fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#FFFFFF', color: '#1C1C1E',
              boxShadow: '0 2px 8px rgba(0,0,0,0.09), 0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.95)',
            }}>
            🖨 Imprimir
          </button>
          <button
            onClick={() => onSave(local)}
            disabled={saveStatus === 'saving' || !hasChanges}
            style={{
              height: 42, padding: '0 20px', borderRadius: 100,
              fontSize: 14, fontWeight: 700, border: 'none',
              cursor: hasChanges && saveStatus !== 'saving' ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', gap: 6,
              background: saveStatus === 'success'
                ? 'linear-gradient(175deg, #30D158 0%, #25A244 100%)'
                : saveStatus === 'error'
                ? 'linear-gradient(175deg, #FF453A 0%, #CC2D22 100%)'
                : hasChanges
                ? 'linear-gradient(175deg, #0A84FF 0%, #0062CC 100%)'
                : '#E5E5EA',
              color: hasChanges || saveStatus !== 'idle' ? '#fff' : '#8E8E93',
              boxShadow: hasChanges
                ? '0 4px 18px rgba(0,98,204,0.36), inset 0 1px 0 rgba(255,255,255,0.2)'
                : 'none',
              opacity: saveStatus === 'saving' ? 0.7 : 1,
              transition: 'all 0.17s ease',
            }}>
            {saveLabel}
          </button>
        </div>
      </div>

      {grpInfo && (
        <div style={{ fontSize: 12, color: '#8E8E93', marginBottom: 12, paddingLeft: 2 }}>
          {grpInfo[2]}
        </div>
      )}

      {/* ── Buscador (oculto en General) ── */}
      {grp !== 'general' && (
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <span style={{
            position: 'absolute', left: 14, top: '50%',
            transform: 'translateY(-50%)', fontSize: 15, pointerEvents: 'none',
          }}>🔍</span>
          <input
            type="text" value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder={'Buscar tienda para agregar — ' + (grpInfo?.[1]?.replace(/[^a-zA-Z0-9áéíóúñ\s]/g, '') || '') + '...'}
            style={{
              width: '100%', height: 46, paddingLeft: 42, paddingRight: 16,
              borderRadius: 14, border: '1.5px solid rgba(0,0,0,0.09)',
              background: '#FFFFFF', color: '#1C1C1E', fontSize: 14,
              outline: 'none', boxSizing: 'border-box',
              boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
            }}
          />
          {showSug && (
            <div style={{
              position: 'absolute', top: 50, left: 0, right: 0,
              background: '#FFFFFF', border: '1.5px solid rgba(0,0,0,0.08)',
              borderRadius: 16, boxShadow: '0 12px 36px rgba(0,0,0,0.14)',
              zIndex: 50, maxHeight: 260, overflowY: 'auto',
            }}>
              {suggest.map(c => {
                const inf = tiendas[c];
                const yaEsta = DIAS.some(d => local[d]?.[grp as 'rm' | 'costa' | 'fal']?.includes(c));
                return (
                  <div key={c} onClick={() => handleAgregar(c)}
                    style={{
                      padding: '11px 16px', cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'space-between',
                      borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F2F2F7')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontFamily: 'monospace', fontSize: 15, fontWeight: 800,
                        color: '#C12828', background: '#FEE2E2',
                        padding: '3px 9px', borderRadius: 9,
                        border: '1.5px solid #FECACA',
                      }}>
                        {formatCod(c)}
                      </span>
                      <span style={{ fontSize: 13, color: '#3C3C43' }}>{inf?.n || ''}</span>
                      <span style={{ fontSize: 11, color: '#8E8E93' }}>{inf?.z || ''}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {yaEsta && <span style={{ fontSize: 11, color: '#8E8E93', fontStyle: 'italic' }}>ya existe</span>}
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: 'linear-gradient(175deg, #E53535 0%, #C12828 100%)',
                        color: '#fff', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 18, fontWeight: 700,
                        boxShadow: '0 3px 10px rgba(193,40,40,0.38)',
                      }}>+</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Vista General ── */}
      {grp === 'general' ? (() => {
        const allFor = (g: 'rm' | 'costa' | 'fal') => {
          const seen = new Set<string>(); const out: string[] = [];
          for (const d of DIAS) for (const c of (local[d]?.[g] ?? [])) if (!seen.has(c)) { seen.add(c); out.push(c); }
          return out;
        };
        const falAll = allFor('fal'); const costaAll = allFor('costa'); const rmAll = allFor('rm');
        const sections: { label: string; g: 'fal'|'costa'|'rm'; stores: string[]; hdrBg: string; accent: string; evenBg: string; oddBg: string }[] = [
          { label:'🏢 Regiones — Sur',      g:'fal',   stores:falAll.filter(c=>!ZONA_NORTE_FAL.has(c)), hdrBg:'#D4A017', accent:'#92400E', evenBg:'#FFFBEB', oddBg:'#FEF3C7' },
          { label:'🏢 Regiones — Norte',    g:'fal',   stores:falAll.filter(c=> ZONA_NORTE_FAL.has(c)), hdrBg:'#F59E0B', accent:'#78350F', evenBg:'#FFFDE7', oddBg:'#FEF9C3' },
          { label:'🌊 Costa — V Región',    g:'costa', stores:costaAll,                                  hdrBg:'#0284C7', accent:'#0F766E', evenBg:'#F0FDFA', oddBg:'#CCFBF1' },
          { label:'📦 RM — Malls',          g:'rm',    stores:rmAll.filter(c=> RM_MALLS.has(c)),         hdrBg:'#DB2777', accent:'#9D174D', evenBg:'#FFF0F6', oddBg:'#FFE4EC' },
          { label:'📦 RM — Street Center',  g:'rm',    stores:rmAll.filter(c=>!RM_MALLS.has(c)),         hdrBg:'#6B7280', accent:'#374151', evenBg:'#F9FAFB', oddBg:'#F3F4F6' },
        ];
        const hasAny = falAll.length + costaAll.length + rmAll.length > 0;
        return (
          <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', background: '#fff' }}>
            <div className="grid" style={{ gridTemplateColumns: 'minmax(180px,1fr) repeat(6,56px)', background: '#1C1C1E' }}>
              <div style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.5)' }}>Tienda</div>
              {DIAS.map(d => (
                <div key={d} style={{ padding: '12px 0', textAlign: 'center', fontSize: 12, fontWeight: 800, color: DCOL[d] }}>
                  {DNOM[d].slice(0, 2)}
                </div>
              ))}
            </div>
            {!hasAny && (
              <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, fontStyle: 'italic', color: '#8E8E93', background: '#fff' }}>Sin tiendas asignadas</div>
            )}
            {sections.map(sec => sec.stores.length === 0 ? null : (
              <div key={sec.label}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', color: '#fff', fontSize: 12, fontWeight: 700, background: sec.hdrBg }}>
                  <span>{sec.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.7 }}>{sec.stores.length} tienda{sec.stores.length !== 1 ? 's' : ''}</span>
                </div>
                {sec.stores.map((cod, i) => (
                  <div key={cod} className="grid items-center" style={{ gridTemplateColumns: 'minmax(180px,1fr) repeat(6,56px)', background: i % 2 === 0 ? sec.evenBg : sec.oddBg, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                    <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, flexShrink: 0, color: sec.accent }}>{formatCod(cod)}</span>
                      <span style={{ fontSize: 11, color: '#8E8E93', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tiendas[cod]?.n || ''}</span>
                    </div>
                    {DIAS.map(d => {
                      const on = !!(local[d]?.[sec.g]?.includes(cod));
                      return (
                        <div key={d} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 0' }}>
                          {on
                            ? <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700, background: DCOL[d] }}>✓</div>
                            : <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.12)' }} />
                          }
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })() : (
      <div>
        {/* Leyenda de tipos */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {(Object.entries(TYPE_STYLE) as [StoreType, typeof TYPE_STYLE[StoreType]][]).map(([type, s]) => (
            <div key={type} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 13px', borderRadius: 100,
              background: s.bg, border: `1.5px solid ${s.border}`,
              boxShadow: `0 2px 6px ${s.shadow}, inset 0 1px 0 rgba(255,255,255,0.6)`,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: s.text }}>{s.label}</span>
            </div>
          ))}
        </div>
        <div style={{ overflowX: 'auto', borderRadius: 18, background: '#FFFFFF', boxShadow: '0 2px 16px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
            <thead>
              <tr>
                {DIAS.map(dia => (
                  <th key={dia} style={{
                    background: DLIGHT[dia],
                    padding: '13px 10px 10px',
                    borderBottom: `3px solid ${DCOL[dia]}`,
                    borderRight: '1px solid rgba(0,0,0,0.05)',
                    minWidth: 118, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: DCOL[dia], letterSpacing: '0.05em' }}>
                      {DNOM[dia].toUpperCase()}
                    </div>
                    <div style={{ fontSize: 13, color: DCOL[dia], opacity: 0.80, marginTop: 4, fontWeight: 700 }}>
                      {(local[dia]?.[grp as 'rm' | 'costa' | 'fal'] || []).length} tiendas
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {DIAS.map(dia => {
                  const tiendasDelDia = local[dia]?.[grp as 'rm' | 'costa' | 'fal'] || [];
                  return (
                    <td key={dia}
                      onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.background = '#F2F2F7'; }}
                      onDragLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}
                      onDrop={e => { (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; onDrop(e, dia); }}
                      style={{
                        verticalAlign: 'top',
                        padding: '8px 6px 10px',
                        borderRight: '1px solid rgba(0,0,0,0.05)',
                        background: '#FFFFFF',
                        minWidth: 118,
                      }}
                    >
                      {tiendasDelDia.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.18)', fontStyle: 'italic', textAlign: 'center', padding: '18px 6px', border: '2px dashed rgba(0,0,0,0.08)', borderRadius: 12, marginTop: 2 }}>
                          Sin tiendas
                        </div>
                      ) : tiendasDelDia.map(cod => {
                        const tipo = getTipo(cod);
                        const ts   = TYPE_STYLE[tipo];
                        return (
                          <div key={cod}
                            draggable
                            onDragStart={e => onDragStart(e, dia, cod)}
                            title={tiendas[cod]?.n || cod}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              background: ts.bg, color: ts.text, border: `1.5px solid ${ts.border}`,
                              borderRadius: 10, padding: '6px 10px', marginBottom: 5,
                              fontSize: 15, fontWeight: 800, fontFamily: 'monospace',
                              cursor: 'grab',
                              boxShadow: `0 2px 6px ${ts.shadow}`,
                              transition: 'all 0.12s',
                            }}
                          >
                            <span>{formatCod(cod)}</span>
                            <span onClick={() => cfgRm(dia, cod)}
                              style={{ fontSize: 14, cursor: 'pointer', opacity: 0.5, marginLeft: 6 }}
                              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                              onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                            >✕</span>
                          </div>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* ── Day picker modal ── */}
      {pickerOpen && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) { setPickerOpen(false); setPickerCod(''); } }}
        >
          <div style={{
            background: '#FFFFFF', borderRadius: 18, padding: 22,
            width: 'min(300px, 88%)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1C1C1E', marginBottom: 4 }}>
              Agregar <span style={{ color: '#C12828' }}>{formatCod(pickerCod)}</span>
              {tiendas[pickerCod] ? ' — ' + tiendas[pickerCod].n : ''}
            </div>
            <div style={{ fontSize: 12, color: '#8E8E93', marginBottom: 14 }}>
              Elige uno o más días · toca de nuevo para quitar:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
              {DIAS.map(d => {
                const yaEsta = local[d]?.[grp as 'rm' | 'costa' | 'fal']?.includes(pickerCod);
                return (
                  <button key={d} onClick={() => handlePickerConfirm(pickerCod, d)}
                    style={{
                      height: 38, borderRadius: 9, fontSize: 13, fontWeight: 600,
                      border: `2px solid ${DCOL[d]}`, cursor: 'pointer',
                      color: yaEsta ? '#fff' : DCOL[d],
                      background: yaEsta ? DCOL[d] : 'transparent',
                      transition: 'all 0.12s',
                    }}>
                    {DNOM[d]}{yaEsta ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => { setPickerOpen(false); setPickerCod(''); }}
              style={{
                width: '100%', height: 38, borderRadius: 9, fontSize: 13,
                fontWeight: 700, border: '1.5px solid #C12828',
                color: '#C12828', background: 'transparent', cursor: 'pointer',
              }}>
              Listo
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
