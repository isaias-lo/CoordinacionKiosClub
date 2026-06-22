'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Truck, MapPin, Store, X, History, Filter, ChevronUp, ChevronDown } from 'lucide-react';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { fmtHoraChile, fmtFechaHoraChile } from '@/lib/fechaChile';
import { HistContent } from '@/screens/HistScreen';
import type { LucideIcon } from 'lucide-react';

type TabKey = 'rm' | 'regiones' | 'recepcion' | 'historial';

const TABS: { key: TabKey; label: string; table: string; Icon: LucideIcon }[] = [
  { key: 'rm',        label: 'Despacho RM',       table: 'despacho_rm',       Icon: Truck },
  { key: 'regiones',  label: 'Despacho Regiones',  table: 'despacho_regiones', Icon: MapPin },
  { key: 'recepcion', label: 'Recepción Tienda',   table: 'recepcion',         Icon: Store },
  { key: 'historial', label: 'Historial',           table: '',                  Icon: History },
];

const TAB_COLORS: Record<TabKey, { bg: string; border: string; text: string }> = {
  rm:        { bg: 'rgba(37,99,235,0.15)',   border: 'rgba(37,99,235,0.4)',   text: '#3B82F6' },
  regiones:  { bg: 'rgba(211,47,47,0.15)',   border: 'rgba(211,47,47,0.4)',   text: '#EF4444' },
  recepcion: { bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.4)',  text: '#10B981' },
  historial: { bg: 'rgba(124,58,237,0.15)',  border: 'rgba(124,58,237,0.4)',  text: '#7C3AED' },
};

const SEGUIMIENTO_STYLE: Record<string, { bg: string; color: string }> = {
  'Registrado': { bg: 'rgba(138,148,166,0.12)', color: '#8A94A6' },
  'Pendiente':  { bg: 'rgba(194,77,77,0.12)',   color: '#C24D4D' },
  'En camino':  { bg: 'rgba(181,136,43,0.14)',  color: '#B5882B' },
  'Entregado':  { bg: 'rgba(91,95,184,0.12)',   color: '#5B5FB8' },
  'Recibido':   { bg: 'rgba(54,153,106,0.13)',  color: '#36996A' },
  'Diferencia': { bg: 'rgba(194,106,58,0.13)',  color: '#C26A3A' },
};

const TABLE_COLS: Record<TabKey, string[]> = {
  rm: [
    'fecha','cod','tienda','tipo','regimen','transporte','carga','region','comuna',
    'peso_kg','estado','n_pallet_bulto','conductor','ruta','supervisor','guia','valor','fuente','seguimiento',
  ],
  regiones: [
    'fecha','cod','tienda','tipo','regimen','transporte','carga','region','comuna',
    'peso_kg','estado','n_pallet_bulto','conductor','ruta','supervisor','guia','valor','fuente','seguimiento',
  ],
  recepcion: [
    'created_at','cod','tienda','pallets_sent','bultos_sent',
    'pallets_recibidos','bultos_recibidos','conductor','receptor','rut',
  ],
  historial: [],
};

const COL_LABEL: Record<string, string> = {
  fecha: 'Fecha', cod: 'Cod', tienda: 'Tienda', tipo: 'Tipo', regimen: 'Régimen',
  transporte: 'Transporte', carga: 'Carga', region: 'Región', comuna: 'Comuna', peso_kg: 'Peso kg',
  estado: 'Estado', n_pallet_bulto: 'N°', conductor: 'Conductor', ruta: 'Ruta',
  supervisor: 'Supervisor', seguimiento: 'Seguimiento', guia: 'Guía', valor: 'Valor',
  fuente: 'Fuente',
  created_at: 'Fecha/Hora', pallets_sent: 'P. Env.', bultos_sent: 'B. Env.',
  pallets_recibidos: 'P. Rec.', bultos_recibidos: 'B. Rec.',
  receptor: 'Receptor', rut: 'RUT',
};

function SeguimientoBadge({ valor }: { valor: string }) {
  const style = SEGUIMIENTO_STYLE[valor] ?? { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 99,
      fontSize: 11, fontWeight: 700, background: style.bg, color: style.color,
      whiteSpace: 'nowrap',
    }}>
      {valor || '—'}
    </span>
  );
}

function formatCell(col: string, val: unknown): React.ReactNode {
  if (col === 'seguimiento') return <SeguimientoBadge valor={String(val ?? '')} />;
  if (col === 'created_at' && val) {
    return fmtFechaHoraChile(String(val));
  }
  return String(val ?? '');
}

// Clave numérica para ordenar fechas: 'dd/mm/yyyy' (despacho) o ISO (created_at).
function dateMs(val: unknown): number {
  const s = String(val ?? '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
  const t = Date.parse(s);
  return isNaN(t) ? -Infinity : t;
}

const DATE_COLS = new Set(['fecha', 'created_at']);

// Comparador de celdas: fechas por timestamp, números por valor, resto alfabético.
function compareCells(col: string, a: unknown, b: unknown): number {
  if (DATE_COLS.has(col)) return dateMs(a) - dateMs(b);
  const an = Number(a), bn = Number(b);
  const aNum = String(a ?? '').trim() !== '' && !isNaN(an);
  const bNum = String(b ?? '').trim() !== '' && !isNaN(bn);
  if (aNum && bNum) return an - bn;
  return String(a ?? '').localeCompare(String(b ?? ''), 'es');
}

// ── Recepcion detail modal ────────────────────────────────────────────────────

type RecepcionRow = Record<string, unknown>;

function formatHora(iso: string): string {
  if (!iso) return '—';
  return fmtHoraChile(iso, true);
}

function PhotoThumb({ url, label, hora }: { url: string; label: string; hora?: string }) {
  if (!url) return null;
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', position: 'relative', borderRadius: 10, overflow: 'hidden', textDecoration: 'none' }}>
        <img src={url} alt={label} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
        {hora && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', padding: '4px 6px', fontSize: 10, color: '#fff', fontWeight: 700 }}>
            🕐 {formatHora(hora)}
          </div>
        )}
        <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.5)', borderRadius: 6, padding: '2px 6px', fontSize: 10, color: '#fff' }}>↗</div>
      </a>
    </div>
  );
}

function RecepcionDetailModal({ row, onClose }: { row: RecepcionRow; onClose: () => void }) {
  const palletsSent = Number(row.pallets_sent ?? 0);
  const bultosSent  = Number(row.bultos_sent  ?? 0);
  const palletsRec  = Number(row.pallets_recibidos ?? 0);
  const bultosRec   = Number(row.bultos_recibidos  ?? 0);
  const match       = palletsRec === palletsSent && bultosRec === bultosSent;
  const estadoFotos = (row.estado_fotos as string[]) ?? [];
  const fechaHora   = row.created_at ? fmtFechaHoraChile(String(row.created_at)) : '—';

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, overflowY: 'auto', padding: '20px 16px 40px' }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 480, margin: '0 auto', background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>

        {/* Modal header */}
        <div style={{ background: 'linear-gradient(135deg, #1B2A6B, #2D3F8C)', padding: '18px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Detalle recepción</div>
            <div style={{ color: '#fff', fontSize: 26, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1 }}>{String(row.cod ?? '')}</div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: 600, marginTop: 4 }}>{String(row.tienda ?? '')}</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 }}>{fechaHora} · fuente: {String(row.fuente ?? '—')}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X size={16} color="rgba(255,255,255,0.8)" />
          </button>
        </div>

        <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Cantidades */}
          <div style={{ background: match ? 'rgba(16,185,129,0.08)' : 'rgba(249,115,22,0.08)', borderRadius: 14, padding: '14px 16px', border: `1px solid ${match ? 'rgba(16,185,129,0.3)' : 'rgba(249,115,22,0.3)'}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: match ? '#10B981' : '#F97316', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              {match ? '✅ Sin diferencia' : '⚠️ Diferencia detectada'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>ENVIADO</div>
              <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}></div>
              <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>RECIBIDO</div>
              {palletsSent > 0 && <>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#1B2A6B' }}>{palletsSent}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', alignSelf: 'center' }}>pallets</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: palletsRec === palletsSent ? '#10B981' : '#EF4444' }}>{palletsRec}</div>
              </>}
              {bultosSent > 0 && <>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#D97706' }}>{bultosSent}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', alignSelf: 'center' }}>bultos</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: bultosRec === bultosSent ? '#10B981' : '#EF4444' }}>{bultosRec}</div>
              </>}
            </div>
          </div>

          {/* Personal */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Personal</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {!!row.conductor && (
                <div style={{ background: '#F8FAFF', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, marginBottom: 2 }}>CONDUCTOR</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>{String(row.conductor)}</div>
                </div>
              )}
              {!!(row.pionetas && String(row.pionetas).trim()) && (
                <div style={{ background: '#F8FAFF', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, marginBottom: 2 }}>PIONETA(S)</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>{String(row.pionetas)}</div>
                </div>
              )}
              {!!row.receptor && (
                <div style={{ background: '#F8FAFF', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, marginBottom: 2 }}>RECEPTOR</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>{String(row.receptor)}</div>
                  {!!row.rut && <div style={{ fontSize: 11, color: '#6B7280', fontFamily: 'monospace', marginTop: 2 }}>{String(row.rut)}</div>}
                </div>
              )}
              {!!row.sello_estado && (
                <div style={{ background: '#F8FAFF', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, marginBottom: 2 }}>ESTADO SELLO</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: row.sello_estado === 'intacto' ? '#10B981' : row.sello_estado === 'roto' ? '#EF4444' : '#F97316' }}>
                    {String(row.sello_estado).charAt(0).toUpperCase() + String(row.sello_estado).slice(1)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Trazabilidad sellos */}
          {!!(row.sello_llegada_url || row.sello_salida_url || row.cd_salida_url) && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Trazabilidad de sellos</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <PhotoThumb url={String(row.cd_salida_url      ?? '')} label="CD Salida"     hora={String(row.cd_salida_hora      ?? '')} />
                <PhotoThumb url={String(row.sello_llegada_url  ?? '')} label="Sello llegada" hora={String(row.sello_llegada_hora  ?? '')} />
                <PhotoThumb url={String(row.sello_salida_url   ?? '')} label="Sello salida"  hora={String(row.sello_salida_hora   ?? '')} />
              </div>
            </div>
          )}

          {/* Fotos estado */}
          {estadoFotos.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                Fotos de estado ({estadoFotos.length})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {estadoFotos.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', position: 'relative', borderRadius: 10, overflow: 'hidden', textDecoration: 'none' }}>
                    <img src={url} alt={`estado ${i + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                    <div style={{ position: 'absolute', top: 4, left: 6, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 5 }}>#{i + 1}</div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Firma */}
          {!!row.firma_url && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Firma del receptor</div>
              <a href={String(row.firma_url)} target="_blank" rel="noopener noreferrer">
                <img src={String(row.firma_url)} alt="firma" style={{ width: '100%', maxHeight: 120, objectFit: 'contain', background: '#F8FAFF', borderRadius: 10, border: '1px solid #E5E7EB', display: 'block' }} />
              </a>
            </div>
          )}

          {/* Observaciones */}
          {!!(row.observaciones && String(row.observaciones).trim()) && (
            <div style={{ background: '#FFFBEB', borderRadius: 12, padding: '12px 14px', border: '1px solid #FDE68A' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Observaciones</div>
              <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.5 }}>{String(row.observaciones)}</div>
            </div>
          )}

          {/* Código verificación */}
          {!!row.codigo_verificacion && (
            <div style={{ background: '#F0F4FF', borderRadius: 12, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#1B2A6B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Código OTP verificado</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1B2A6B', fontFamily: 'monospace', letterSpacing: '0.3em' }}>{String(row.codigo_verificacion)}</div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Columnas redimensionables (ancho por columna, estilo Sheets) ──────────────
const COLW_KEY = 'registros_colwidths_v1';
const DEFAULT_COLW: Record<string, number> = {
  fecha: 96, cod: 64, tienda: 160, tipo: 80, regimen: 90, transporte: 120,
  carga: 80, region: 150, comuna: 150, peso_kg: 78, estado: 140, n_pallet_bulto: 52,
  conductor: 140, ruta: 56, supervisor: 140, guia: 100, valor: 90, fuente: 90, seguimiento: 112,
  created_at: 150, pallets_sent: 72, bultos_sent: 72, pallets_recibidos: 72, bultos_recibidos: 72,
  receptor: 140, rut: 112,
};

// ── Menú de filtro por columna (estilo Excel/Sheets) ──────────────────────────
function ColumnFilterMenu({ values, selected, onApply, onClose, accent }: {
  values: string[]; selected: string[];
  onApply: (vals: string[]) => void; onClose: () => void; accent: string;
}) {
  const [q, setQ] = useState('');
  // draft = valores marcados. Sin filtro activo (selected vacío) ⇒ todos marcados.
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected.length ? selected : values));

  const shown = q.trim() ? values.filter(v => v.toLowerCase().includes(q.toLowerCase())) : values;
  const allShownChecked = shown.length > 0 && shown.every(v => draft.has(v));
  const toggle = (v: string) => setDraft(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const toggleAllShown = () => setDraft(prev => {
    const n = new Set(prev);
    if (allShownChecked) shown.forEach(v => n.delete(v)); else shown.forEach(v => n.add(v));
    return n;
  });
  const apply = () => {
    const all = values.length > 0 && values.every(v => draft.has(v));
    onApply(all ? [] : Array.from(draft)); // todos marcados ⇒ sin filtro
    onClose();
  };

  return (
    <div onClick={e => e.stopPropagation()}
      style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, width: 232, background: '#fff',
        border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.18)', zIndex: 40,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', textTransform: 'none', letterSpacing: 'normal' }}>
      <div style={{ padding: 8, borderBottom: '1px solid #F1F5F9' }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar valor…"
          style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid #E2E8F0', borderRadius: 6, outline: 'none', color: '#0F172A' }} />
      </div>
      <button onClick={toggleAllShown}
        style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, fontWeight: 700, color: '#334155', background: '#F8FAFC', border: 'none', borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}>
        {allShownChecked ? '☑' : '☐'} (Seleccionar todo)
      </button>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {shown.map(v => (
          <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', fontSize: 12, color: '#1F2937', cursor: 'pointer' }}>
            <input type="checkbox" checked={draft.has(v)} onChange={() => toggle(v)} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v === '' ? '(vacío)' : v}</span>
          </label>
        ))}
        {shown.length === 0 && <div style={{ padding: 10, fontSize: 12, color: '#94A3B8' }}>Sin valores</div>}
      </div>
      <div style={{ display: 'flex', gap: 6, padding: 8, borderTop: '1px solid #F1F5F9' }}>
        <button onClick={() => { onApply([]); onClose(); }}
          style={{ flex: 1, padding: 6, fontSize: 12, fontWeight: 700, color: '#64748B', background: '#F1F5F9', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Limpiar
        </button>
        <button onClick={apply}
          style={{ flex: 1, padding: 6, fontSize: 12, fontWeight: 700, color: '#fff', background: accent, border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Aplicar
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RegistrosPage() {
  const router  = useRouter();
  const [tab,         setTab]         = useState<TabKey>('rm');
  const [rows,        setRows]        = useState<Record<string, unknown>[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [syncing,     setSyncing]     = useState(false);
  const [error,       setError]       = useState('');
  const [search,      setSearch]      = useState('');
  const [selectedRow, setSelectedRow] = useState<RecepcionRow | null>(null);

  // Anchos de columna redimensionables (persisten en localStorage)
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  useEffect(() => {
    try { setColWidths(JSON.parse(localStorage.getItem(COLW_KEY) || '{}')); } catch {}
  }, []);
  const widthFor = (c: string) => colWidths[c] ?? DEFAULT_COLW[c] ?? 110;
  const resizeRef = useRef<{ col: string; startX: number; startW: number } | null>(null);
  const startResize = (c: string, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    resizeRef.current = { col: c, startX: e.clientX, startW: widthFor(c) };
    const move = (ev: PointerEvent) => {
      const r = resizeRef.current; if (!r) return;
      const w = Math.max(44, r.startW + (ev.clientX - r.startX));
      setColWidths(prev => ({ ...prev, [r.col]: w }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      resizeRef.current = null;
      setColWidths(prev => { try { localStorage.setItem(COLW_KEY, JSON.stringify(prev)); } catch {} return prev; });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Orden (columna + dirección) y filtros por columna (estilo Excel/Sheets)
  const [sortCol, setSortCol]       = useState<string>('');
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('desc');
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  const tabCfg = TABS.find(t => t.key === tab)!;
  const cols   = TABLE_COLS[tab];
  const color  = TAB_COLORS[tab];

  // Columna de orden por defecto: fecha del despacho (o fecha/hora en recepción).
  const defaultSortCol = tab === 'recepcion' ? 'created_at' : 'fecha';
  const effSortCol = sortCol || defaultSortCol;

  // Al cambiar de pestaña, resetear orden y filtros.
  useEffect(() => { setSortCol(''); setSortDir('desc'); setColFilters({}); setOpenFilter(null); }, [tab]);

  const toggleSort = (col: string) => {
    if (effSortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
  };

  const loadData = useCallback(async (table: string): Promise<Record<string, unknown>[]> => {
    setLoading(true); setError(''); setRows([]);
    try {
      const res  = await fetch(`/api/despacho-records?table=${encodeURIComponent(table)}`);
      const data = await res.json() as { data?: Record<string, unknown>[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const loaded = data.data ?? [];
      setRows(loaded);
      return loaded;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos');
      return [];
    } finally { setLoading(false); }
  }, []);

  const silentRefresh = useCallback(async () => {
    try {
      const res  = await fetch(`/api/despacho-records?table=${encodeURIComponent(tabCfg.table)}`);
      const data = await res.json() as { data?: Record<string, unknown>[] };
      if (res.ok) setRows(data.data ?? []);
    } catch {}
  }, [tabCfg.table]);

  const syncFromSheets = useCallback(async () => {
    if (tabCfg.key === 'recepcion' || tabCfg.key === 'historial') return;
    setSyncing(true);
    try {
      await fetch('/api/sync-despacho', { method: 'POST' });
      await loadData(tabCfg.table);
    } finally { setSyncing(false); }
  }, [tabCfg.key, tabCfg.table, loadData]);

  const didAutoSync = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (tab === 'historial') return;
    loadData(tabCfg.table).then(loaded => {
      if (loaded.length === 0 && tabCfg.key !== 'recepcion' && !didAutoSync.current[tabCfg.key]) {
        didAutoSync.current[tabCfg.key] = true;
        syncFromSheets();
      }
    });
  }, [tab, tabCfg.table, tabCfg.key, loadData, syncFromSheets]);

  useRealtimeRefresh(tab === 'historial' ? '' : tabCfg.table, silentRefresh);

  // 1) Búsqueda global
  const searched = search.trim()
    ? rows.filter(r => cols.some(c => String(r[c] ?? '').toLowerCase().includes(search.toLowerCase())))
    : rows;

  // 2) Filtros por columna (valores permitidos por columna; vacío = todos)
  const activeFilterCols = cols.filter(c => (colFilters[c]?.length ?? 0) > 0);
  const applyFilters = (list: Record<string, unknown>[], exceptCol?: string) =>
    list.filter(r => activeFilterCols.every(c => c === exceptCol || colFilters[c].includes(String(r[c] ?? ''))));
  const colFiltered = applyFilters(searched);

  // 3) Orden (por la columna activa y dirección)
  const filtered = [...colFiltered].sort((a, b) => {
    const cmp = compareCells(effSortCol, a[effSortCol], b[effSortCol]);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // Valores distintos para el desplegable de una columna (respeta los otros filtros)
  const distinctFor = (col: string): string[] =>
    Array.from(new Set(applyFilters(searched, col).map(r => String(r[col] ?? ''))))
      .sort((a, b) => compareCells(col, a, b));

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden"
         style={{ background: '#FFFFFF' }}>

      {/* Header (conserva el azulado) */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3"
           style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button onClick={() => router.push('/despacho')}
          className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
          style={{ width: 36, height: 36, background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)' }}>
          <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
        </button>
        <div className="flex-1">
          <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase">Registros de Despacho</div>
          <div className="text-[11px] text-white/40 uppercase tracking-widest">{loading ? 'Cargando…' : `${filtered.length} registros`}</div>
        </div>
        {tab !== 'recepcion' && tab !== 'historial' && (
          <button onClick={syncFromSheets} disabled={syncing}
            className="px-3 py-1.5 rounded-xl text-[13px] cursor-pointer hover:bg-white/10 transition-colors border border-white/10 disabled:opacity-50"
            style={{ color: '#10B981' }}>
            {syncing ? 'Sincronizando…' : '⇅ Sheets'}
          </button>
        )}
        {tab !== 'historial' && (
        <button onClick={() => loadData(tabCfg.table)}
          className="px-3 py-1.5 rounded-xl text-[13px] text-white/60 cursor-pointer hover:bg-white/10 transition-colors border border-white/10">
          ↺ Actualizar
        </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex gap-2 px-4 pt-3 pb-1 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSearch(''); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-barlow-condensed text-[14px] font-bold uppercase tracking-wider cursor-pointer transition-all"
            style={tab === t.key
              ? { background: TAB_COLORS[t.key].bg, border: `1px solid ${TAB_COLORS[t.key].border}`, color: TAB_COLORS[t.key].text }
              : { background: '#F1F5F9', border: '1px solid #E2E8F0', color: '#64748B' }}>
            <t.Icon size={13} strokeWidth={2} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Seguimiento legend */}
      {tab !== 'recepcion' && tab !== 'historial' && (
        <div className="flex-shrink-0 flex gap-2 px-4 py-2 flex-wrap">
          {Object.entries(SEGUIMIENTO_STYLE).map(([estado, s]) => (
            <span key={estado} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
              {estado}
            </span>
          ))}
        </div>
      )}

      {/* Click hint for recepcion */}
      {tab === 'recepcion' && !loading && filtered.length > 0 && (
        <div className="flex-shrink-0 px-4 py-1">
          <span style={{ fontSize: 11, color: '#94A3B8' }}>Toca una fila para ver el detalle completo (fotos, sellos, firma)</span>
        </div>
      )}

      {/* Search */}
      {tab !== 'historial' && (
      <div className="flex-shrink-0 px-4 py-2">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por tienda, cod, estado…"
          className="w-full px-3 py-2 rounded-xl text-[14px] focus:outline-none transition-colors"
          style={{ background: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0' }} />
      </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        {tab === 'historial' ? (
          <div className="h-full overflow-y-auto">
            <HistContent />
          </div>
        ) : (<>
        {loading && <div className="text-center py-16 text-sm" style={{ color: '#94A3B8' }}>Cargando datos…</div>}
        {error && <div className="text-sm text-center py-4 rounded-xl mb-4" style={{ background: 'rgba(211,47,47,0.08)', color: '#B91C1C' }}>{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16 text-sm" style={{ color: '#94A3B8' }}>
            {search ? 'Sin resultados para tu búsqueda' : 'No hay registros todavía'}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #E5E7EB', background: '#fff' }}>
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
              <table className="text-[12px]" style={{ tableLayout: 'fixed', width: cols.reduce((a, c) => a + widthFor(c), 0), borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    {cols.map(c => {
                      const hasFilter = (colFilters[c]?.length ?? 0) > 0;
                      return (
                      <th key={c} className="text-left font-bold uppercase tracking-wider"
                          style={{
                            width: widthFor(c), color: color.text, background: '#F1F5F9',
                            borderBottom: `2px solid ${color.border}`, borderRight: '1px solid #E5E7EB',
                            position: 'sticky', top: 0, zIndex: openFilter === c ? 30 : 2, padding: 0,
                          }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 14px 8px 12px', position: 'relative' }}>
                          {/* Título = botón de orden */}
                          <button onClick={() => toggleSort(c)} title="Ordenar por esta columna"
                            style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: color.text, font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', padding: 0, textAlign: 'left' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{COL_LABEL[c] ?? c}</span>
                            {effSortCol === c && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                          </button>
                          {/* Botón de filtro */}
                          <button onClick={() => setOpenFilter(openFilter === c ? null : c)} title="Filtrar"
                            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 5, cursor: 'pointer',
                              background: hasFilter ? color.text : 'transparent', border: 'none', color: hasFilter ? '#fff' : '#94A3B8' }}>
                            <Filter size={12} />
                          </button>
                          {openFilter === c && (
                            <ColumnFilterMenu
                              values={distinctFor(c)}
                              selected={colFilters[c] ?? []}
                              accent={color.text}
                              onApply={vals => setColFilters(prev => { const n = { ...prev }; if (vals.length) n[c] = vals; else delete n[c]; return n; })}
                              onClose={() => setOpenFilter(null)}
                            />
                          )}
                        </div>
                        {/* Manija para redimensionar (arrastrar) */}
                        <span onPointerDown={e => startResize(c, e)} title="Arrastra para ajustar el ancho"
                          style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: 8, cursor: 'col-resize', touchAction: 'none', userSelect: 'none', borderRight: '2px solid transparent' }}
                          onMouseEnter={e => (e.currentTarget.style.borderRight = `2px solid ${color.text}`)}
                          onMouseLeave={e => (e.currentTarget.style.borderRight = '2px solid transparent')} />
                      </th>
                    );})}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, ri) => (
                    <tr key={ri}
                        onClick={() => tab === 'recepcion' ? setSelectedRow(row) : undefined}
                        style={{ cursor: tab === 'recepcion' ? 'pointer' : 'default', background: ri % 2 ? '#FAFBFC' : '#fff' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#EEF2FF')}
                        onMouseLeave={e => (e.currentTarget.style.background = ri % 2 ? '#FAFBFC' : '#fff')}>
                      {cols.map(c => (
                        <td key={c} className="px-3 py-2"
                            title={String(row[c] ?? '')}
                            style={{ width: widthFor(c), color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: '1px solid #F1F5F9' }}>
                          {formatCell(c, row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 text-[11px] border-t" style={{ color: '#94A3B8', borderColor: '#F1F5F9' }}>
              {filtered.length} registros · {tabCfg.label}
              {tab === 'recepcion' && ' · Toca una fila para ver detalle'}
            </div>
          </div>
        )}
        </>)}
      </div>

      {/* Backdrop para cerrar el filtro al hacer clic fuera */}
      {openFilter && (
        <div onClick={() => setOpenFilter(null)} style={{ position: 'fixed', inset: 0, zIndex: 25 }} />
      )}

      {/* Detail modal */}
      {selectedRow && (
        <RecepcionDetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />
      )}
    </div>
  );
}
