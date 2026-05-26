'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { formatCod } from '@/features/despacho/rutas/utils/helpers';
import { fetchCalendarioCompleto, writeCalendario } from '@/features/despacho/utils/useCalendario';
import { saveCalendario } from '@/lib/calendarioSync';
import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';

const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
const DNOM: Record<string, string> = { LU: 'Lunes', MA: 'Martes', MI: 'Miércoles', JU: 'Jueves', VI: 'Viernes', SA: 'Sábado' };
const DCOL: Record<string, string> = { LU: '#007AFF', MA: '#34C759', MI: '#FF9500', JU: '#AF52DE', VI: '#FF2D55', SA: '#00C7BE' };
const DLIGHT: Record<string, string> = { LU: '#EBF4FF', MA: '#EDFFF4', MI: '#FFF8ED', JU: '#F5EFFE', VI: '#FFEBEE', SA: '#E5FFFE' };

const GRUPOS: [string, string, string][] = [
  ['rm',      '📦 RM',        'Bodega Santiago — RM'],
  ['costa',   '🌊 COSTA',     'Bodega Santiago — V Región'],
  ['fal',     '🏢 REGIONES',  'Bodega Regiones'],
  ['general', '📋 GENERAL',   'Vista completa — todos los grupos'],
];

const COSTA_CODES    = new Set(['37VIN','08RNC','33CON','43CUR','54MPQ']);
const FAL_CODES      = new Set(['46TRE','28TEM','75PUC','53VAL','47PTV','50PTM','39PSB','41ANA','42ANP','31TLC','36CHL','24SPP','38SP2','76PAN','51SER','27MCH']);
const ZONA_NORTE_FAL = new Set(['41ANA','42ANP','39PSB','51SER']); // Antofagasta + La Serena
const RM_MALLS       = new Set(['16PQA','20CTC','29CFL','52MUT','19SUB','45EST','49PTA']);

type CalRecord = Record<string, { rm: string[]; costa: string[]; fal: string[] }>;
type StoreType = 'mall' | 'street' | 'costa' | 'region';

const TYPE_STYLE: Record<StoreType, { bg: string; text: string; border: string; label: string; shadow: string }> = {
  mall:   { bg: '#EDE9FE', text: '#5B21B6', border: '#C4B5FD', label: 'MALL',          shadow: 'rgba(91,33,182,0.16)'  },
  street: { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD', label: 'STREET CENTER', shadow: 'rgba(29,78,216,0.16)'  },
  costa:  { bg: '#CCFBF1', text: '#0F766E', border: '#5EEAD4', label: 'COSTA',         shadow: 'rgba(15,118,110,0.16)' },
  region: { bg: '#FFEDD5', text: '#C2410C', border: '#FDBA74', label: 'REGIÓN',        shadow: 'rgba(194,65,12,0.16)'  },
};

function storeGroup(cod: string): 'rm' | 'costa' | 'fal' {
  if (COSTA_CODES.has(cod)) return 'costa';
  if (FAL_CODES.has(cod))   return 'fal';
  return 'rm';
}

function displayCode(cod: string): string {
  return formatCod(cod.replace('PEN', 'PEÑ').replace('VIN', 'VIÑ'));
}

export default function CalendarioColumnas() {
  const [cal, setCal]               = useState<CalRecord | null>(null);
  const [local, setLocal]           = useState<CalRecord | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [lastSaved, setLastSaved]   = useState<string | null>(null);
  const [grp, setGrp]               = useState('rm');
  const [search, setSearch]         = useState('');
  const [suggest, setSuggest]       = useState<string[]>([]);
  const [showSug, setShowSug]       = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCod, setPickerCod]   = useState('');
  const [dragOver, setDragOver]     = useState<{ dia: string; idx: number } | null>(null);

  const ddRef = useRef<{ dia: string | null; cod: string | null; idx: number }>({ dia: null, cod: null, idx: -1 });
  const [tiendasDB, setTiendasDB] = useState<Record<string, { n: string; z: string; d: string }>>({});

  useEffect(() => {
    fetch('/api/tiendas')
      .then(r => r.json())
      .then((json: { tiendas?: Array<{ codigo: string; nombre: string; sector_comuna?: string; direccion?: string; activo?: boolean }> }) => {
        const db: Record<string, { n: string; z: string; d: string }> = {};
        for (const t of (json.tiendas ?? [])) {
          if (t.activo === false) continue;
          db[t.codigo] = { n: t.nombre, z: t.sector_comuna ?? '', d: t.direccion ?? '' };
        }
        setTiendasDB(db);
      })
      .catch(() => {});
  }, []);

  // Merged lookup: TIENDAS_INICIAL as base, overridden by active DB stores
  const tiendasAll = useMemo<Record<string, { n: string; z: string; d: string }>>(() => {
    const base: Record<string, { n: string; z: string; d: string }> = {};
    for (const [k, v] of Object.entries(TIENDAS_INICIAL)) {
      base[k] = { n: v.n, z: v.z, d: v.d ?? '' };
    }
    return { ...base, ...tiendasDB };
  }, [tiendasDB]);

  function getTipo(cod: string): StoreType {
    const inf = tiendasAll[cod] ?? tiendasAll[cod.replace('PEN', 'PEÑ')] ?? tiendasAll[cod.replace('VIN', 'VIÑ')];
    if (!inf) return 'street';
    if (inf.z === 'Región') return 'region';
    if (inf.z === 'Costa')  return 'costa';
    if (inf.d && /local/i.test(inf.d)) return 'mall';
    return 'street';
  }

  function getNombre(cod: string): string {
    return tiendasAll[cod]?.n
      ?? tiendasAll[cod.replace('PEN', 'PEÑ')]?.n
      ?? tiendasAll[cod.replace('VIN', 'VIÑ')]?.n
      ?? cod;
  }

  useEffect(() => {
    fetchCalendarioCompleto()
      .then(c => { setCal(c); setLocal(JSON.parse(JSON.stringify(c))); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (cal) setLocal(JSON.parse(JSON.stringify(cal)));
  }, [cal]);

  const hasChanges = local && cal && JSON.stringify(local) !== JSON.stringify(cal);

  function handleSearch(q: string) {
    setSearch(q);
    const qup = q.trim().toUpperCase();
    if (!qup) { setSuggest([]); setShowSug(false); return; }
    const res = Object.keys(tiendasAll).filter(c => {
      if (storeGroup(c) !== grp) return false;
      const nombre = (tiendasAll[c].n || '').toUpperCase();
      return c.indexOf(qup) >= 0 || nombre.indexOf(qup) >= 0;
    }).slice(0, 8);
    setSuggest(res);
    setShowSug(res.length > 0);
  }

  function handleAgregar(cod: string) {
    setSearch(''); setSuggest([]); setShowSug(false);
    setPickerCod(cod); setPickerOpen(true);
  }

  function handlePickerConfirm(cod: string, dia: string) {
    setLocal(prev => {
      if (!prev) return prev;
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

  function remove(dia: string, cod: string) {
    setLocal(prev => {
      if (!prev) return prev;
      const next: CalRecord = JSON.parse(JSON.stringify(prev));
      const a = next[dia]?.[grp as 'rm' | 'costa' | 'fal'];
      if (a) { const i = a.indexOf(cod); if (i >= 0) a.splice(i, 1); }
      return next;
    });
  }

  function onDragStart(e: React.DragEvent, dia: string, cod: string, idx: number) {
    ddRef.current = { dia, cod, idx };
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragEnd() {
    setDragOver(null);
    ddRef.current = { dia: null, cod: null, idx: -1 };
  }

  // Drop on a specific chip → insert before that chip's position
  function onDropOnChip(e: React.DragEvent, targetDia: string, targetIdx: number) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const { dia: srcDia, cod } = ddRef.current;
    if (!cod || !srcDia) return;

    setLocal(prev => {
      if (!prev) return prev;
      const next: CalRecord = JSON.parse(JSON.stringify(prev));
      const g = grp as 'rm' | 'costa' | 'fal';
      if (!next[srcDia!]) next[srcDia!] = { rm: [], costa: [], fal: [] };
      if (!next[targetDia]) next[targetDia] = { rm: [], costa: [], fal: [] };
      if (!next[srcDia!][g]) next[srcDia!][g] = [];
      if (!next[targetDia][g]) next[targetDia][g] = [];

      if (srcDia === targetDia) {
        // Reorder within same column
        const arr = next[srcDia!][g];
        const from = arr.indexOf(cod);
        if (from < 0) return prev;
        arr.splice(from, 1);
        const to = targetIdx > from ? targetIdx - 1 : targetIdx;
        arr.splice(Math.max(0, to), 0, cod);
      } else {
        // Move cross-column at specific index
        const src = next[srcDia!][g];
        const dst = next[targetDia][g];
        const from = src.indexOf(cod);
        if (from >= 0) src.splice(from, 1);
        if (!dst.includes(cod)) dst.splice(targetIdx, 0, cod);
      }
      return next;
    });
  }

  // Drop on td background → append to end (cross-column only)
  function onDropOnTd(e: React.DragEvent, targetDia: string) {
    e.preventDefault();
    setDragOver(null);
    const { dia: srcDia, cod } = ddRef.current;
    if (!cod || !srcDia || srcDia === targetDia) return;
    setLocal(prev => {
      if (!prev) return prev;
      const next: CalRecord = JSON.parse(JSON.stringify(prev));
      const g = grp as 'rm' | 'costa' | 'fal';
      const src = next[srcDia!]?.[g] || [];
      const dst = next[targetDia]?.[g] || [];
      const idx = src.indexOf(cod);
      if (idx >= 0) { src.splice(idx, 1); if (!dst.includes(cod)) dst.push(cod); }
      if (next[srcDia!]) next[srcDia!][g] = src;
      if (next[targetDia]) next[targetDia][g] = dst;
      return next;
    });
  }

  async function handleSave() {
    if (!local) return;
    setSaveStatus('saving');
    try {
      // Primary: Supabase (must succeed — source of truth)
      await saveCalendario(local);
      writeCalendario(local);
      setCal(local);
      setSaveStatus('success');
      setLastSaved(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
      setTimeout(() => setSaveStatus('idle'), 3500);
      // Secondary: Sheets copy (fire-and-forget — no bloquea el guardado)
      fetch('/api/calendario-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendario: local }),
      }).catch(e => console.error('[CalendarioColumnas:sheets]', e));
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    }
  }

  const saveLabel = saveStatus === 'saving'  ? '⏳ Guardando...'
    : saveStatus === 'success' ? '✅ Guardado'
    : saveStatus === 'error'   ? '⚠️ Error'
    : hasChanges               ? '💾 Guardar cambios'
    : 'Sin cambios';

  /* ── Print ── */
  function handlePrint() {
    if (!local) return;

    type Zone = 'norte' | 'sur' | 'costa' | 'rm' | 'mall';
    const ZONE_COLOR: Record<Zone, { bg: string; text: string; border: string }> = {
      norte: { bg: '#FEF08A', text: '#713F12', border: '#FDE047' },
      sur:   { bg: '#BAE6FD', text: '#0C4A6E', border: '#7DD3FC' },
      costa: { bg: '#99F6E4', text: '#134E4A', border: '#5EEAD4' },
      rm:    { bg: '#F1F5F9', text: '#334155', border: '#CBD5E1' },
      mall:  { bg: '#FECDD3', text: '#881337', border: '#FDA4AF' },
    };

    // RM calendar order → Costa calendar order → Regiones calendar order
    const dayOrdered: Array<Array<{ cod: string; zone: Zone }>> = DIAS.map(dia => {
      const rm    = local![dia]?.rm    || [];
      const costa = local![dia]?.costa || [];
      const fal   = local![dia]?.fal   || [];
      return [
        ...rm.map(c    => ({ cod: c, zone: (RM_MALLS.has(c) ? 'mall' : 'rm')         as Zone })),
        ...costa.map(c => ({ cod: c, zone: 'costa'                                    as Zone })),
        ...fal.map(c   => ({ cod: c, zone: (ZONA_NORTE_FAL.has(c) ? 'norte' : 'sur') as Zone })),
      ];
    });

    const maxRows = Math.max(...dayOrdered.map(d => d.length), 1);

    let bodyRows = '';
    for (let i = 0; i < maxRows; i++) {
      bodyRows += '<tr>';
      for (let j = 0; j < DIAS.length; j++) {
        const store = dayOrdered[j][i];
        if (store) {
          const c = ZONE_COLOR[store.zone];
          bodyRows += `<td style="background:${c.bg};color:${c.text};border:1px solid ${c.border};font-weight:bold;font-family:monospace;text-align:center;padding:5px 3px;font-size:12px;white-space:nowrap">${displayCode(store.cod)}</td>`;
        } else {
          bodyRows += `<td style="border:1px solid #E2E8F0;background:#FAFAFA"></td>`;
        }
      }
      bodyRows += '</tr>';
    }

    const today = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

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
    .legend { display: flex; gap: 16px; justify-content: center; margin-bottom: 14px; flex-wrap: wrap; }
    .leg-item { display: flex; align-items: center; gap: 5px; font-size: 10px; color: #444; }
    .leg-dot { width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0; border: 1px solid rgba(0,0,0,0.15); }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    th { background: #111A3E; color: #fff; font-weight: 800; padding: 8px 4px; border: 1px solid #333; text-align: center; font-size: 13px; letter-spacing: 0.05em; }
    td { border: 1px solid #E2E8F0; padding: 4px 3px; height: 26px; }
    @media print {
      @page { size: A4 portrait; margin: 0.7cm; }
      body { margin: 0; font-size: 10px; }
    }
  </style>
</head>
<body>
  <h1>Calendario de Despacho — KiosClub</h1>
  <p class="subtitle">Impreso el ${today} &nbsp;·&nbsp; Orden por columna: RM → Costa → Regiones</p>
  <div class="legend">
    <div class="leg-item"><div class="leg-dot" style="background:#F1F5F9;border-color:#CBD5E1"></div>RM</div>
    <div class="leg-item"><div class="leg-dot" style="background:#FECDD3;border-color:#FDA4AF"></div>Malls RM</div>
    <div class="leg-item"><div class="leg-dot" style="background:#99F6E4;border-color:#5EEAD4"></div>Costa Valparaíso</div>
    <div class="leg-item"><div class="leg-dot" style="background:#FEF08A;border-color:#FDE047"></div>Zona Norte (Regiones)</div>
    <div class="leg-item"><div class="leg-dot" style="background:#BAE6FD;border-color:#7DD3FC"></div>Zona Sur (Regiones)</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>LUNES</th>
        <th>MARTES</th>
        <th>MIÉRCOLES</th>
        <th>JUEVES</th>
        <th>VIERNES</th>
        <th>SÁBADO</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
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

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div style={{
        background: '#FFFFFF', borderRadius: 20, padding: '60px 20px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
      }}>
        <div style={{
          width: 38, height: 38, border: '3px solid #E5E5EA',
          borderTopColor: '#007AFF', borderRadius: '50%',
          animation: 'spin 0.75s linear infinite',
        }} />
        <div style={{ fontSize: 14, color: '#8E8E93', fontWeight: 500 }}>Cargando calendario...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!local) {
    return (
      <div style={{
        background: '#FFFFFF', borderRadius: 20, padding: '40px 20px',
        textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
      }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>⚠️</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#FF3B30' }}>No se pudo cargar el calendario</div>
        <div style={{ fontSize: 13, color: '#8E8E93', marginTop: 4 }}>Revisa la conexión con Supabase</div>
      </div>
    );
  }

  const grpInfo = GRUPOS.find(g => g[0] === grp);

  return (
    <div style={{ background: '#F2F2F7', borderRadius: 20, padding: '20px 16px 24px' }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
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
          {lastSaved && (
            <span style={{ fontSize: 11, color: '#8E8E93', fontFamily: 'monospace' }}>
              Guardado {lastSaved}
            </span>
          )}
          <button
            onClick={handlePrint}
            style={{
              height: 42, padding: '0 18px', borderRadius: 100,
              fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#FFFFFF',
              color: '#1C1C1E',
              boxShadow: '0 2px 8px rgba(0,0,0,0.09), 0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.95)',
            }}>
            🖨 Imprimir
          </button>
          <button
            onClick={handleSave}
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
        <div style={{ fontSize: 12, color: '#8E8E93', marginBottom: 10, paddingLeft: 2 }}>
          {grpInfo[2]}
        </div>
      )}

      {/* ── Legend (oculta en General) ── */}
      {grp !== 'general' && (
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
      )}

      {/* ── Search (oculta en General) ── */}
      {grp !== 'general' && <div style={{ position: 'relative', marginBottom: 16 }}>
        <span style={{
          position: 'absolute', left: 14, top: '50%',
          transform: 'translateY(-50%)', fontSize: 15, pointerEvents: 'none',
        }}>🔍</span>
        <input
          type="text" value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder={`Buscar tienda para agregar — ${grpInfo?.[1].replace(/\p{Emoji}/u, '').trim() || ''}...`}
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
              const tipo = getTipo(c);
              const ts = TYPE_STYLE[tipo];
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
                      color: ts.text, background: ts.bg,
                      padding: '3px 9px', borderRadius: 9,
                      border: `1.5px solid ${ts.border}`,
                      boxShadow: `0 2px 6px ${ts.shadow}`,
                    }}>
                      {displayCode(c)}
                    </span>
                    <span style={{ fontSize: 13, color: '#3C3C43' }}>{getNombre(c)}</span>
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
      </div>}

      {/* ── General view: days as columns, stores as chips (PDF-style) ── */}
      {grp === 'general' && (() => {
        type GZone = 'rm' | 'mall' | 'costa' | 'norte' | 'sur';
        const GZONE: Record<GZone, { bg: string; text: string; border: string; shadow: string; label: string }> = {
          rm:    { bg: '#F1F5F9', text: '#334155', border: '#CBD5E1', shadow: 'rgba(51,65,85,0.14)',    label: 'RM'             },
          mall:  { bg: '#FECDD3', text: '#881337', border: '#FDA4AF', shadow: 'rgba(136,19,55,0.14)',   label: 'Mall RM'        },
          costa: { bg: '#99F6E4', text: '#134E4A', border: '#5EEAD4', shadow: 'rgba(19,78,74,0.14)',    label: 'Costa'          },
          norte: { bg: '#FEF08A', text: '#713F12', border: '#FDE047', shadow: 'rgba(113,63,18,0.14)',   label: 'Regiones Norte' },
          sur:   { bg: '#BAE6FD', text: '#0C4A6E', border: '#7DD3FC', shadow: 'rgba(12,74,110,0.14)',   label: 'Regiones Sur'   },
        };
        return (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {(Object.entries(GZONE) as [GZone, typeof GZONE[GZone]][]).map(([z, zc]) => (
                <div key={z} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 100, background: zc.bg, border: `1.5px solid ${zc.border}`, boxShadow: `0 2px 6px ${zc.shadow}` }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: zc.text }}>{zc.label}</span>
                </div>
              ))}
            </div>
            <div style={{ overflowX: 'auto', borderRadius: 18, background: '#FFFFFF', boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
                <thead>
                  <tr>
                    {DIAS.map(dia => {
                      const count = (local![dia]?.rm?.length || 0) + (local![dia]?.costa?.length || 0) + (local![dia]?.fal?.length || 0);
                      return (
                        <th key={dia} style={{ background: DLIGHT[dia], padding: '13px 10px 10px', borderBottom: `3px solid ${DCOL[dia]}`, borderRight: '1px solid rgba(0,0,0,0.05)', minWidth: 118, textAlign: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: DCOL[dia], letterSpacing: '0.05em' }}>{DNOM[dia].toUpperCase()}</div>
                          <div style={{ fontSize: 12, color: DCOL[dia], opacity: 0.75, marginTop: 3, fontWeight: 600 }}>{count} tiendas</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {DIAS.map(dia => {
                      const rm    = local![dia]?.rm    || [];
                      const costa = local![dia]?.costa || [];
                      const fal   = local![dia]?.fal   || [];
                      const stores: { cod: string; zone: GZone }[] = [
                        ...fal.map(c   => ({ cod: c, zone: (ZONA_NORTE_FAL.has(c) ? 'norte' : 'sur') as GZone })),
                        ...costa.map(c => ({ cod: c, zone: 'costa'                                    as GZone })),
                        ...rm.map(c    => ({ cod: c, zone: (RM_MALLS.has(c) ? 'mall' : 'rm')         as GZone })),
                      ];
                      return (
                        <td key={dia} style={{ verticalAlign: 'top', padding: '8px 6px 10px', borderRight: '1px solid rgba(0,0,0,0.05)', background: '#FFFFFF', minWidth: 118 }}>
                          {stores.length === 0 ? (
                            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.18)', fontStyle: 'italic', textAlign: 'center', padding: '18px 6px', border: '2px dashed rgba(0,0,0,0.08)', borderRadius: 12, marginTop: 2 }}>
                              Sin tiendas
                            </div>
                          ) : stores.map(({ cod, zone }) => {
                            const zc = GZONE[zone];
                            return (
                              <div key={cod} style={{ background: zc.bg, color: zc.text, border: `1.5px solid ${zc.border}`, borderRadius: 10, padding: '6px 10px', marginBottom: 5, fontSize: 13, fontWeight: 800, fontFamily: 'monospace', textAlign: 'center', boxShadow: `0 2px 6px ${zc.shadow}` }}>
                                {displayCode(cod)}
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
        );
      })()}

      {grp !== 'general' && <div style={{
        overflowX: 'auto', borderRadius: 18,
        background: '#FFFFFF',
        boxShadow: '0 2px 16px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)',
      }}>
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
                const tiendas = local[dia]?.[grp as 'rm' | 'costa' | 'fal'] || [];
                return (
                  <td key={dia}
                    onDragEnter={e => {
                      e.preventDefault();
                      setDragOver({ dia, idx: tiendas.length });
                    }}
                    onDragOver={e => e.preventDefault()}
                    onDragLeave={e => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDragOver(null);
                      }
                    }}
                    onDrop={e => onDropOnTd(e, dia)}
                    style={{
                      verticalAlign: 'top',
                      padding: '8px 6px 10px',
                      borderRight: '1px solid rgba(0,0,0,0.05)',
                      background: '#FFFFFF',
                      minWidth: 118,
                    }}
                  >
                    {tiendas.map((cod, i) => {
                      const tipo = getTipo(cod);
                      const ts   = TYPE_STYLE[tipo];
                      const nombre = getNombre(cod);
                      const showLineBefore = dragOver?.dia === dia && dragOver?.idx === i;
                      return (
                        <div key={cod}>
                          {showLineBefore && (
                            <div style={{
                              height: 3, borderRadius: 2,
                              background: '#007AFF',
                              margin: '2px 2px 4px',
                              boxShadow: '0 0 8px rgba(0,122,255,0.55)',
                            }} />
                          )}
                          <div
                            draggable
                            onDragStart={e => onDragStart(e, dia, cod, i)}
                            onDragEnd={onDragEnd}
                            onDragEnter={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOver({ dia, idx: i });
                            }}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => onDropOnChip(e, dia, i)}
                            title={nombre}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              background: ts.bg, color: ts.text,
                              border: `1.5px solid ${ts.border}`,
                              borderRadius: 12, padding: '8px 11px', marginBottom: 6,
                              fontSize: 15, fontWeight: 800, fontFamily: 'monospace',
                              cursor: 'grab', userSelect: 'none',
                              boxShadow: `0 2px 8px ${ts.shadow}, inset 0 1px 0 rgba(255,255,255,0.55)`,
                              transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                            }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                              (e.currentTarget as HTMLElement).style.boxShadow = `0 5px 14px ${ts.shadow}, inset 0 1px 0 rgba(255,255,255,0.55)`;
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                              (e.currentTarget as HTMLElement).style.boxShadow = `0 2px 8px ${ts.shadow}, inset 0 1px 0 rgba(255,255,255,0.55)`;
                            }}
                          >
                            <span style={{ letterSpacing: '0.01em' }}>{displayCode(cod)}</span>
                            <span
                              onClick={e => { e.stopPropagation(); remove(dia, cod); }}
                              style={{
                                marginLeft: 8, fontSize: 11, opacity: 0.4,
                                cursor: 'pointer', lineHeight: 1,
                                fontFamily: 'sans-serif', transition: 'opacity 0.15s',
                                padding: '1px 3px', borderRadius: 4,
                              }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.4'; }}
                            >✕</span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Insert indicator after last chip */}
                    {dragOver?.dia === dia && dragOver?.idx === tiendas.length && (
                      <div style={{
                        height: 3, borderRadius: 2,
                        background: '#007AFF',
                        margin: '2px 2px 4px',
                        boxShadow: '0 0 8px rgba(0,122,255,0.55)',
                      }} />
                    )}

                    {tiendas.length === 0 && (
                      <div style={{
                        fontSize: 12, color: 'rgba(0,0,0,0.18)', fontStyle: 'italic',
                        textAlign: 'center', padding: '18px 6px',
                        border: '2px dashed rgba(0,0,0,0.08)', borderRadius: 12, marginTop: 2,
                      }}>
                        Sin tiendas
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>}

      {/* ── Day picker modal ── */}
      {pickerOpen && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) { setPickerOpen(false); setPickerCod(''); } }}
        >
          <div style={{
            background: '#FFFFFF', borderRadius: 26,
            padding: '26px 22px 22px', width: 'min(320px, 88vw)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.08)',
          }}>
            {(() => {
              const tipo = getTipo(pickerCod);
              const ts = TYPE_STYLE[tipo];
              return (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1C1C1E', marginBottom: 3 }}>
                    Agregar{' '}
                    <span style={{
                      color: ts.text, background: ts.bg,
                      padding: '3px 9px', borderRadius: 9,
                      fontFamily: 'monospace', fontWeight: 800,
                      border: `1.5px solid ${ts.border}`,
                      boxShadow: `0 2px 6px ${ts.shadow}`,
                    }}>
                      {displayCode(pickerCod)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#8E8E93', marginBottom: 3, fontWeight: 500 }}>
                    {getNombre(pickerCod)}
                  </div>
                  <div style={{ fontSize: 12, color: '#C7C7CC', marginBottom: 18 }}>
                    Elige uno o más días · toca de nuevo para quitar
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                    {DIAS.map(d => {
                      const yaEsta = local?.[d]?.[grp as 'rm' | 'costa' | 'fal']?.includes(pickerCod);
                      return (
                        <button key={d} onClick={() => handlePickerConfirm(pickerCod, d)}
                          style={{
                            height: 44, borderRadius: 13, fontSize: 13, fontWeight: 600,
                            border: `2px solid ${DCOL[d]}`,
                            color: yaEsta ? '#fff' : DCOL[d],
                            background: yaEsta ? DCOL[d] : DLIGHT[d],
                            cursor: 'pointer',
                            boxShadow: yaEsta ? `0 2px 8px ${DCOL[d]}55` : `0 2px 8px rgba(0,0,0,0.07)`,
                            transition: 'all 0.14s ease',
                          }}>
                          {DNOM[d]}{yaEsta ? ' ✓' : ''}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => { setPickerOpen(false); setPickerCod(''); }}
                    style={{
                      width: '100%', height: 44, borderRadius: 13,
                      fontSize: 14, fontWeight: 700,
                      background: 'linear-gradient(175deg, #E53535 0%, #C12828 100%)',
                      color: '#fff', border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(193,40,40,0.35)',
                    }}>
                    Listo
                  </button>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
