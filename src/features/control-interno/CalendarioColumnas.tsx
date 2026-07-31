'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { formatCod } from '@/features/despacho/rutas/utils/helpers';
import { fetchCalendarioCompleto, writeCalendario } from '@/features/despacho/utils/useCalendario';
import { saveCalendario } from '@/lib/calendarioSync';
import {
  fetchCalendarioArmado, saveCalendarioArmado, subscribeToCalendarioArmado,
  computeDiff, crearNotificacion, fetchCalendarioDespacho,
  marcarNotificacionResuelta, type CalRecord as CalRecordType,
} from '@/lib/calendarioArmadoSync';
import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';
import CalendarioNotificaciones from '@/components/CalendarioNotificaciones';
import {
  Package, Waves, Building2, ClipboardList,
  CheckCircle2, AlertTriangle, Save, Loader2, Printer, Search,
  Plus, X, Check,
  type LucideIcon,
} from 'lucide-react';

const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'];
const DNOM: Record<string, string> = { LU: 'Lunes', MA: 'Martes', MI: 'Miércoles', JU: 'Jueves', VI: 'Viernes', SA: 'Sábado', DO: 'Domingo' };
// Columna de "hoy" (única distinción por día — el resto de columnas quedan neutras). new
// Date().getDay(): 0=domingo..6=sábado → se remapea a la posición de DIAS (lunes primero).
const TODAY_DIA = DIAS[(new Date().getDay() + 6) % 7];

const GRUPOS: [string, string, string][] = [
  ['rm',      'RM',        'Bodega Santiago — RM'],
  ['costa',   'COSTA',     'Bodega Santiago — V Región'],
  ['fal',     'REGIONES',  'Bodega Regiones'],
  ['general', 'GENERAL',   'Vista completa — todos los grupos'],
];
const GRP_ICON: Record<string, LucideIcon> = {
  rm: Package, costa: Waves, fal: Building2, general: ClipboardList,
};

const ZONA_NORTE_FAL = new Set(['41ANA','42ANP','39PSB','51SER']); // Antofagasta + La Serena
const RM_MALLS       = new Set(['16PQA','20CTC','29CFL','52MUT','19SUB','45EST','49PTA']);

type CalRecord = Record<string, { rm: string[]; costa: string[]; fal: string[] }>;
type StoreType = 'mall' | 'street' | 'costa' | 'region';

// Chip plano compartido (fondo/texto neutros) + acento de color solo en el borde izquierdo —
// reemplaza los chips pastel con sombra de color por el sistema de diseño enterprise.
const TYPE_STYLE: Record<StoreType, { accent: string; label: string }> = {
  mall:   { accent: '#1E40AF', label: 'MALL' },
  street: { accent: '#475569', label: 'STREET CENTER' },
  costa:  { accent: '#2563EB', label: 'COSTA' },
  region: { accent: '#D97706', label: 'REGIÓN' },
};

function displayCode(cod: string): string {
  return formatCod(cod.replace('PEN', 'PEÑ').replace('VIN', 'VIÑ'));
}

export default function CalendarioColumnas({
  readOnly = false,
  source   = 'despacho',
  forceGeneral = false,   // muestra solo la vista General y oculta el selector de grupos
}: {
  readOnly?: boolean;
  source?:   'despacho' | 'armado';
  forceGeneral?: boolean;
}) {
  const [cal, setCal]               = useState<CalRecord | null>(null);
  const [local, setLocal]           = useState<CalRecord | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [lastSaved, setLastSaved]   = useState<string | null>(null);
  const [grp, setGrp]               = useState(forceGeneral ? 'general' : 'rm');
  const [search, setSearch]         = useState('');
  const [suggest, setSuggest]       = useState<string[]>([]);
  const [showSug, setShowSug]       = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCod, setPickerCod]   = useState('');
  const [dragOver, setDragOver]     = useState<{ dia: string; idx: number } | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 6;
    const s = localStorage.getItem('cal_visible_count');
    const n = s ? parseInt(s, 10) : 6;
    return isNaN(n) ? 6 : Math.min(7, Math.max(1, n));
  });

  const ddRef = useRef<{ dia: string | null; cod: string | null; idx: number }>({ dia: null, cod: null, idx: -1 });
  const pendingResolveRef = useRef<string[]>([]);
  const [tiendasDB, setTiendasDB] = useState<Record<string, { n: string; z: string; d: string }>>({});
  const firstDayBtnRef = useRef<HTMLButtonElement>(null);

  // Modal de días: cierre con Escape + foco inicial en el primer día (accesibilidad).
  useEffect(() => {
    if (!pickerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPickerOpen(false); setPickerCod(''); }
    };
    document.addEventListener('keydown', onKeyDown);
    firstDayBtnRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pickerOpen]);

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

  // Clasifica una tienda en el grupo del calendario usando la metadata real (Supabase + TIENDAS_INICIAL),
  // en vez de los sets hardcodeados COSTA_CODES/FAL_CODES que no se actualizan al agregar nuevas tiendas.
  function getGroup(cod: string): 'rm' | 'costa' | 'fal' {
    const tipo = getTipo(cod);
    if (tipo === 'region') return 'fal';
    if (tipo === 'costa')  return 'costa';
    return 'rm';
  }

  useEffect(() => {
    const loader = source === 'armado'
      ? fetchCalendarioArmado().then(c => c ?? fetchCalendarioCompleto())
      : fetchCalendarioCompleto();
    loader
      .then(c => { setCal(c); setLocal(JSON.parse(JSON.stringify(c))); setLoading(false); })
      .catch(() => setLoading(false));

    if (source === 'armado') {
      const unsub = subscribeToCalendarioArmado(c => setCal(c));
      return unsub;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    if (cal) setLocal(JSON.parse(JSON.stringify(cal)));
  }, [cal]);

  const hasChanges = local && cal && JSON.stringify(local) !== JSON.stringify(cal);

  const visibleDias = DIAS.slice(0, visibleCount);

  function updateVisibleCount(n: number) {
    const clamped = Math.min(7, Math.max(1, n));
    setVisibleCount(clamped);
    localStorage.setItem('cal_visible_count', String(clamped));
  }

  function handleSearch(q: string) {
    setSearch(q);
    const qup = q.trim().toUpperCase();
    if (!qup) { setSuggest([]); setShowSug(false); return; }
    const res = Object.keys(tiendasAll).filter(c => {
      if (getGroup(c) !== grp) return false;
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

  // Drop on td background → append to end (same column or cross-column)
  function onDropOnTd(e: React.DragEvent, targetDia: string) {
    e.preventDefault();
    setDragOver(null);
    const { dia: srcDia, cod } = ddRef.current;
    if (!cod || !srcDia) return;
    setLocal(prev => {
      if (!prev) return prev;
      const next: CalRecord = JSON.parse(JSON.stringify(prev));
      const g = grp as 'rm' | 'costa' | 'fal';
      if (!next[srcDia!]) next[srcDia!] = { rm: [], costa: [], fal: [] };
      if (!next[targetDia]) next[targetDia] = { rm: [], costa: [], fal: [] };
      const src = next[srcDia!][g] || [];
      const idx = src.indexOf(cod);
      if (idx < 0) return prev;
      src.splice(idx, 1);
      if (srcDia === targetDia) {
        // Misma columna: mover al final
        src.push(cod);
        next[srcDia!][g] = src;
      } else {
        // Cross-column: agregar al final de la columna destino
        const dst = next[targetDia][g] || [];
        if (!dst.includes(cod)) dst.push(cod);
        next[srcDia!][g] = src;
        next[targetDia][g] = dst;
      }
      return next;
    });
  }

  async function handleSave() {
    if (!local) return;
    setSaveStatus('saving');
    try {
      if (source === 'armado') {
        await saveCalendarioArmado(local);
        const calDespacho = await fetchCalendarioDespacho();
        if (calDespacho) {
          const cambios = computeDiff(calDespacho, local);
          await crearNotificacion(cambios, local);
        }
      } else {
        await saveCalendario(local);
        writeCalendario(local);
        fetch('/api/calendario-write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ calendario: local }),
        }).catch(e => console.error('[CalendarioColumnas:sheets]', e));
        // Resolve notifications that were locally applied
        const toResolve = pendingResolveRef.current.splice(0);
        for (const id of toResolve) void marcarNotificacionResuelta(id);
      }
      setCal(local);
      setSaveStatus('success');
      setLastSaved(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
      setTimeout(() => setSaveStatus('idle'), 3500);
    } catch (err) {
      console.error('[CalendarioColumnas:save]', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    }
  }

  const saveLabel = saveStatus === 'saving'  ? 'Guardando...'
    : saveStatus === 'success' ? 'Guardado'
    : saveStatus === 'error'   ? 'Error'
    : hasChanges               ? 'Guardar cambios'
    : 'Sin cambios';
  const SaveIcon: LucideIcon | null = saveStatus === 'saving'  ? Loader2
    : saveStatus === 'success' ? CheckCircle2
    : saveStatus === 'error'   ? AlertTriangle
    : hasChanges               ? Save
    : null;

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

    // Regiones → Costa → RM (igual que la vista General)
    const dayOrdered: Array<Array<{ cod: string; zone: Zone }>> = visibleDias.map(dia => {
      const rm    = local![dia]?.rm    || [];
      const costa = local![dia]?.costa || [];
      const fal   = local![dia]?.fal   || [];
      return [
        ...fal.map(c   => ({ cod: c, zone: (ZONA_NORTE_FAL.has(c) ? 'norte' : 'sur') as Zone })),
        ...costa.map(c => ({ cod: c, zone: 'costa'                                    as Zone })),
        ...rm.map(c    => ({ cod: c, zone: (RM_MALLS.has(c) ? 'mall' : 'rm')         as Zone })),
      ];
    });

    const maxRows = Math.max(...dayOrdered.map(d => d.length), 1);

    let bodyRows = '';
    for (let i = 0; i < maxRows; i++) {
      bodyRows += '<tr>';
      for (let j = 0; j < visibleDias.length; j++) {
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
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    @media print {
      @page { size: A4 portrait; margin: 0.7cm; }
      body { margin: 0; font-size: 10px; }
    }
  </style>
</head>
<body>
  <h1>Calendario de Despacho — KiosClub</h1>
  <p class="subtitle">Impreso el ${today} &nbsp;·&nbsp; Orden por columna: Regiones → Costa → RM</p>
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
        ${visibleDias.map(d => `<th>${DNOM[d].toUpperCase()}</th>`).join('')}
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
        background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0', padding: '60px 20px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <div style={{
          width: 32, height: 32, border: '3px solid #E2E8F0',
          borderTopColor: '#1E40AF', borderRadius: '50%',
          animation: 'spin 0.75s linear infinite',
        }} />
        <div style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>Cargando calendario...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!local) {
    return (
      <div style={{
        background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0', padding: '40px 20px',
        textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}><AlertTriangle size={32} color="#DC2626" aria-hidden="true" /></div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#DC2626' }}>No se pudo cargar el calendario</div>
        <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>Revisa la conexión con Supabase</div>
      </div>
    );
  }

  const grpInfo = GRUPOS.find(g => g[0] === grp);

  return (
    <>
    {source === 'despacho' && (
      <CalendarioNotificaciones
        localCal={local as CalRecordType}
        onApplyToLocal={newCal => setLocal(newCal as CalRecord)}
        onMarkPendingResolve={id => { pendingResolveRef.current.push(id); }}
      />
    )}
    <div style={{ background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0', padding: '16px 16px 20px' }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        {!forceGeneral && (
          <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0' }}>
            {GRUPOS.map(([id, lb]) => {
              const active = grp === id;
              const Icon = GRP_ICON[id];
              return (
                <button key={id}
                  onClick={() => { setGrp(id); setSearch(''); setSuggest([]); setShowSug(false); }}
                  style={{
                    padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 13, fontWeight: 500,
                    color: active ? '#1E40AF' : '#64748B',
                    borderBottom: active ? '2px solid #1E40AF' : '2px solid transparent',
                    marginBottom: -1,
                  }}>
                  <Icon size={14} aria-hidden="true" />
                  {lb}
                </button>
              );
            })}
          </div>
        )}

        {/* Day count stepper */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          background: '#fff', borderRadius: 6, height: 34,
          border: '1px solid #E2E8F0', padding: '0 4px 0 10px',
        }}>
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500, marginRight: 4, whiteSpace: 'nowrap' }}>
            Días:
          </span>
          <button
            onClick={() => updateVisibleCount(visibleCount - 1)}
            disabled={visibleCount <= 1}
            aria-label="Mostrar un día menos"
            style={{
              width: 26, height: 26, borderRadius: 4, border: 'none',
              background: 'transparent',
              cursor: visibleCount <= 1 ? 'default' : 'pointer',
              fontSize: 16, color: visibleCount <= 1 ? '#CBD5E1' : '#334155',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700,
            }}>−</button>
          <span style={{
            fontSize: 13, fontWeight: 600, color: '#0F172A',
            minWidth: 18, textAlign: 'center',
          }}>{visibleCount}</span>
          <button
            onClick={() => updateVisibleCount(visibleCount + 1)}
            disabled={visibleCount >= 7}
            aria-label="Mostrar un día más"
            style={{
              width: 26, height: 26, borderRadius: 4, border: 'none',
              background: 'transparent',
              cursor: visibleCount >= 7 ? 'default' : 'pointer',
              fontSize: 16, color: visibleCount >= 7 ? '#CBD5E1' : '#334155',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700,
            }}>+</button>
          <span style={{
            fontSize: 11, color: '#64748B',
            fontWeight: 600, marginLeft: 4, marginRight: 2,
          }}>{DNOM[visibleDias[visibleDias.length - 1]]?.slice(0, 3).toUpperCase()}</span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastSaved && (
            <span style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'monospace' }}>
              Guardado {lastSaved}
            </span>
          )}
          <button
            onClick={handlePrint}
            style={{
              height: 34, padding: '0 14px', borderRadius: 6,
              fontSize: 13, fontWeight: 500, border: '1px solid #E2E8F0', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#fff', color: '#334155',
            }}>
            <Printer size={14} aria-hidden="true" /> Imprimir
          </button>
          {!readOnly && <button
            onClick={handleSave}
            disabled={saveStatus === 'saving' || !hasChanges}
            style={{
              height: 34, padding: '0 16px', borderRadius: 6,
              fontSize: 13, fontWeight: 500, border: 'none',
              cursor: hasChanges && saveStatus !== 'saving' ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', gap: 6,
              background: saveStatus === 'success'
                ? '#16A34A'
                : saveStatus === 'error'
                ? '#DC2626'
                : hasChanges
                ? '#1E40AF'
                : '#F1F5F9',
              color: hasChanges || saveStatus !== 'idle' ? '#fff' : '#94A3B8',
              opacity: saveStatus === 'saving' ? 0.7 : 1,
            }}>
            {SaveIcon && <SaveIcon size={14} aria-hidden="true" className={saveStatus === 'saving' ? 'animate-spin' : undefined} />}
            {saveLabel}
          </button>}
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
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 6,
              background: '#F1F5F9', border: '1px solid #E2E8F0', borderLeft: `3px solid ${s.accent}`,
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Search (oculta en General y en readOnly) ── */}
      {grp !== 'general' && !readOnly && <div style={{ position: 'relative', marginBottom: 16 }}>
        <span style={{
          position: 'absolute', left: 12, top: '50%',
          transform: 'translateY(-50%)', pointerEvents: 'none',
          display: 'flex', color: '#94A3B8',
        }}><Search size={15} aria-hidden="true" /></span>
        <label htmlFor="cal-search-tienda" className="sr-only">Buscar tienda para agregar</label>
        <input
          id="cal-search-tienda"
          type="text" value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder={`Buscar tienda para agregar — ${grpInfo?.[1] || ''}...`}
          style={{
            width: '100%', height: 38, paddingLeft: 38, paddingRight: 16,
            borderRadius: 6, border: '1px solid #E2E8F0',
            background: '#fff', color: '#0F172A', fontSize: 13,
            outline: 'none', boxSizing: 'border-box',
          }}
        />
        {showSug && (
          <div role="listbox" style={{
            position: 'absolute', top: 42, left: 0, right: 0,
            background: '#fff', border: '1px solid #E2E8F0',
            borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
            zIndex: 50, maxHeight: 260, overflowY: 'auto',
          }}>
            {suggest.map(c => {
              const tipo = getTipo(c);
              const ts = TYPE_STYLE[tipo];
              const yaEsta = DIAS.some(d => local[d]?.[grp as 'rm' | 'costa' | 'fal']?.includes(c));
              return (
                <div key={c} role="option" aria-selected={false} onClick={() => handleAgregar(c)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: '1px solid #F1F5F9', transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
                      color: '#475569', background: '#F1F5F9',
                      padding: '3px 8px', borderRadius: 4, borderLeft: `3px solid ${ts.accent}`,
                    }}>
                      {displayCode(c)}
                    </span>
                    <span style={{ fontSize: 13, color: '#334155' }}>{getNombre(c)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {yaEsta && <span style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>ya existe</span>}
                    <div style={{
                      width: 24, height: 24, borderRadius: 4,
                      background: '#1E40AF',
                      color: '#fff', display: 'flex', alignItems: 'center',
                      justifyContent: 'center',
                    }}><Plus size={14} aria-hidden="true" /></div>
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
        const GZONE: Record<GZone, { accent: string; label: string }> = {
          rm:    { accent: '#475569', label: 'RM'             },
          mall:  { accent: '#1E40AF', label: 'Mall RM'        },
          costa: { accent: '#2563EB', label: 'Costa'          },
          norte: { accent: '#D97706', label: 'Regiones Norte' },
          sur:   { accent: '#16A34A', label: 'Regiones Sur'   },
        };
        return (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {(Object.entries(GZONE) as [GZone, typeof GZONE[GZone]][]).map(([z, zc]) => (
                <div key={z} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: '#F1F5F9', border: '1px solid #E2E8F0', borderLeft: `3px solid ${zc.accent}` }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{zc.label}</span>
                </div>
              ))}
            </div>
            <div style={{ overflowX: 'auto', borderRadius: 8, background: '#fff', border: '1px solid #E2E8F0' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
                <thead>
                  <tr>
                    {visibleDias.map(dia => {
                      const count = (local![dia]?.rm?.length || 0) + (local![dia]?.costa?.length || 0) + (local![dia]?.fal?.length || 0);
                      const isToday = dia === TODAY_DIA;
                      return (
                        <th key={dia} style={{
                          background: '#F8FAFC', padding: '13px 10px 10px',
                          borderBottom: isToday ? '2px solid #1E40AF' : '2px solid #E2E8F0',
                          borderRight: '1px solid #E2E8F0', minWidth: 118, textAlign: 'center',
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: isToday ? '#1E40AF' : '#0F172A', letterSpacing: '0.05em' }}>{DNOM[dia].toUpperCase()}</div>
                          <div style={{ fontSize: 12, color: '#64748B', marginTop: 3, fontWeight: 500 }}>{count} tiendas</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {visibleDias.map(dia => {
                      const rm    = local![dia]?.rm    || [];
                      const costa = local![dia]?.costa || [];
                      const fal   = local![dia]?.fal   || [];
                      const stores: { cod: string; zone: GZone }[] = [
                        ...fal.map(c   => ({ cod: c, zone: (ZONA_NORTE_FAL.has(c) ? 'norte' : 'sur') as GZone })),
                        ...costa.map(c => ({ cod: c, zone: 'costa'                                    as GZone })),
                        ...rm.map(c    => ({ cod: c, zone: (RM_MALLS.has(c) ? 'mall' : 'rm')         as GZone })),
                      ];
                      return (
                        <td key={dia} style={{ verticalAlign: 'top', padding: '8px 6px 10px', borderRight: '1px solid #E2E8F0', background: '#fff', minWidth: 118 }}>
                          {stores.length === 0 ? (
                            <div style={{ fontSize: 12, color: '#CBD5E1', fontStyle: 'italic', textAlign: 'center', padding: '18px 6px', border: '2px dashed #E2E8F0', borderRadius: 6, marginTop: 2 }}>
                              Sin tiendas
                            </div>
                          ) : stores.map(({ cod, zone }) => {
                            const zc = GZONE[zone];
                            return (
                              <div key={cod} style={{ background: '#F1F5F9', color: '#334155', border: '1px solid #E2E8F0', borderLeft: `3px solid ${zc.accent}`, borderRadius: 6, padding: '6px 10px', marginBottom: 5, fontSize: 15, fontWeight: 700, fontFamily: 'monospace', textAlign: 'center' }}>
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
        overflowX: 'auto', borderRadius: 8,
        background: '#fff', border: '1px solid #E2E8F0',
      }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
          <thead>
            <tr>
              {visibleDias.map(dia => {
                const isToday = dia === TODAY_DIA;
                return (
                  <th key={dia} style={{
                    background: '#F8FAFC',
                    padding: '13px 10px 10px',
                    borderBottom: isToday ? '2px solid #1E40AF' : '2px solid #E2E8F0',
                    borderRight: '1px solid #E2E8F0',
                    minWidth: 118, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isToday ? '#1E40AF' : '#0F172A', letterSpacing: '0.05em' }}>
                      {DNOM[dia].toUpperCase()}
                    </div>
                    <div style={{ fontSize: 13, color: '#64748B', marginTop: 4, fontWeight: 600 }}>
                      {(local[dia]?.[grp as 'rm' | 'costa' | 'fal'] || []).length} tiendas
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr>
              {visibleDias.map(dia => {
                const tiendas = local[dia]?.[grp as 'rm' | 'costa' | 'fal'] || [];
                const isDragOverCol = dragOver?.dia === dia;
                return (
                  <td key={dia}
                    onDragEnter={readOnly ? undefined : e => {
                      e.preventDefault();
                      setDragOver({ dia, idx: tiendas.length });
                    }}
                    onDragOver={readOnly ? undefined : e => e.preventDefault()}
                    onDragLeave={readOnly ? undefined : e => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDragOver(null);
                      }
                    }}
                    onDrop={readOnly ? undefined : e => onDropOnTd(e, dia)}
                    style={{
                      verticalAlign: 'top',
                      padding: '8px 6px 10px',
                      borderRight: '1px solid #E2E8F0',
                      background: isDragOverCol ? '#EFF6FF' : '#fff',
                      boxShadow: isDragOverCol ? 'inset 0 0 0 2px #1E40AF' : 'none',
                      minWidth: 118,
                    }}
                  >
                    {tiendas.map((cod, i) => {
                      const tipo = getTipo(cod);
                      const ts   = TYPE_STYLE[tipo];
                      const nombre = getNombre(cod);
                      const showLineBefore = dragOver?.dia === dia && dragOver?.idx === i;
                      const isDragging = ddRef.current.dia === dia && ddRef.current.cod === cod;
                      return (
                        <div key={cod}>
                          {showLineBefore && (
                            <div style={{ height: 3, borderRadius: 2, background: '#1E40AF', margin: '2px 2px 4px' }} />
                          )}
                          <div
                            draggable={!readOnly}
                            onDragStart={readOnly ? undefined : e => onDragStart(e, dia, cod, i)}
                            onDragEnd={readOnly ? undefined : onDragEnd}
                            onDragEnter={readOnly ? undefined : e => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOver({ dia, idx: i });
                            }}
                            onDragOver={readOnly ? undefined : e => e.preventDefault()}
                            onDrop={readOnly ? undefined : e => onDropOnChip(e, dia, i)}
                            title={nombre}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              background: '#F1F5F9', color: '#334155',
                              border: '1px solid #E2E8F0', borderLeft: `3px solid ${ts.accent}`,
                              borderRadius: 6, padding: '8px 11px', marginBottom: 6,
                              fontSize: 15, fontWeight: 700, fontFamily: 'monospace',
                              cursor: 'grab', userSelect: 'none',
                              opacity: isDragging ? 0.4 : 1,
                              transition: 'background 0.12s ease',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#E2E8F0'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F1F5F9'; }}
                          >
                            <span style={{ letterSpacing: '0.01em' }}>{displayCode(cod)}</span>
                            {!readOnly && (
                              <button type="button" draggable={false}
                                onClick={e => { e.stopPropagation(); remove(dia, cod); }}
                                aria-label={`Quitar ${displayCode(cod)} de ${DNOM[dia]}`}
                                style={{
                                  marginLeft: 8, opacity: 0.45,
                                  cursor: 'pointer', lineHeight: 1,
                                  transition: 'opacity 0.15s',
                                  padding: 3, borderRadius: 4,
                                  border: 'none', background: 'transparent', color: '#334155',
                                  display: 'flex', alignItems: 'center',
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.45'; }}
                              ><X size={12} /></button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Insert indicator after last chip */}
                    {dragOver?.dia === dia && dragOver?.idx === tiendas.length && (
                      <div style={{ height: 3, borderRadius: 2, background: '#1E40AF', margin: '2px 2px 4px' }} />
                    )}

                    {tiendas.length === 0 && (
                      <div style={{
                        fontSize: 12, color: '#CBD5E1', fontStyle: 'italic',
                        textAlign: 'center', padding: '18px 6px',
                        border: '2px dashed #E2E8F0', borderRadius: 6, marginTop: 2,
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
          role="presentation"
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) { setPickerOpen(false); setPickerCod(''); } }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="cal-picker-title" style={{
            background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0',
            padding: '20px 20px 18px', width: 'min(320px, 88vw)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
          }}>
            {(() => {
              const tipo = getTipo(pickerCod);
              const ts = TYPE_STYLE[tipo];
              return (
                <>
                  <div id="cal-picker-title" style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', marginBottom: 3 }}>
                    Agregar{' '}
                    <span style={{
                      color: '#475569', background: '#F1F5F9',
                      padding: '3px 8px', borderRadius: 4, borderLeft: `3px solid ${ts.accent}`,
                      fontFamily: 'monospace', fontWeight: 700,
                    }}>
                      {displayCode(pickerCod)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#64748B', marginBottom: 3, fontWeight: 500 }}>
                    {getNombre(pickerCod)}
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 16 }}>
                    Elige uno o más días · toca de nuevo para quitar
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                    {DIAS.map((d, di) => {
                      const yaEsta = local?.[d]?.[grp as 'rm' | 'costa' | 'fal']?.includes(pickerCod);
                      return (
                        <button key={d}
                          ref={di === 0 ? firstDayBtnRef : undefined}
                          onClick={() => handlePickerConfirm(pickerCod, d)}
                          style={{
                            height: 40, borderRadius: 6, fontSize: 13, fontWeight: 500,
                            border: yaEsta ? '1px solid #1E40AF' : '1px solid #E2E8F0',
                            color: yaEsta ? '#fff' : '#334155',
                            background: yaEsta ? '#1E40AF' : '#fff',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          }}>
                          {DNOM[d]}{yaEsta && <Check size={12} aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => { setPickerOpen(false); setPickerCod(''); }}
                    style={{
                      width: '100%', height: 40, borderRadius: 6,
                      fontSize: 13, fontWeight: 600,
                      background: '#1E40AF',
                      color: '#fff', border: 'none',
                      cursor: 'pointer',
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
    </>
  );
}
