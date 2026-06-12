'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { CombineAlertsPanel } from './CombineAlertsPanel';

// ── Types ─────────────────────────────────────────────────────────────────────
type SubTab = 'rm' | 'regiones' | 'recepcion';
type Row    = Record<string, unknown>;

interface ColDef {
  key:          string;
  label:        string;
  defaultWidth: number;
  minWidth?:    number;
}

// ── Sub-tabs config ───────────────────────────────────────────────────────────
const SUB_TABS: { key: SubTab; label: string; table: string; color: string; activeBg: string }[] = [
  { key: 'rm',        label: 'Despacho RM',       table: 'despacho_rm',       color: '#1B2A6B', activeBg: 'rgba(27,42,107,0.10)'  },
  { key: 'regiones',  label: 'Despacho Regiones',  table: 'despacho_regiones', color: '#DC2626', activeBg: 'rgba(220,38,38,0.10)'  },
  { key: 'recepcion', label: 'Recepción Tienda',   table: 'recepcion',         color: '#10B981', activeBg: 'rgba(16,185,129,0.10)' },
];

// ── Column definitions ────────────────────────────────────────────────────────
// First 10 = default visible; remaining 9 = optional (hidden by default)
const RM_COLS: ColDef[] = [
  { key: 'fecha',          label: 'Fecha',        defaultWidth: 100, minWidth: 70  },
  { key: 'cod',            label: 'Cod',          defaultWidth: 80,  minWidth: 50  },
  { key: 'tienda',         label: 'Tienda',       defaultWidth: 170, minWidth: 80  },
  { key: 'tipo',           label: 'Tipo',         defaultWidth: 95,  minWidth: 60  },
  { key: 'n_pallet_bulto', label: 'N°',           defaultWidth: 55,  minWidth: 40  },
  { key: 'peso_kg',        label: 'Peso kg',      defaultWidth: 75,  minWidth: 50  },
  { key: 'conductor',      label: 'Conductor',    defaultWidth: 130, minWidth: 70  },
  { key: 'ruta',           label: 'Ruta',         defaultWidth: 55,  minWidth: 40  },
  { key: 'estado',         label: 'Estado',       defaultWidth: 155, minWidth: 90  },
  { key: 'seguimiento',    label: 'Seguimiento',  defaultWidth: 120, minWidth: 80  },
  // ── Columnas adicionales ──────────────────────────────────────────────────
  { key: 'regimen',              label: 'Régimen',       defaultWidth: 85,  minWidth: 55  },
  { key: 'transporte',           label: 'Transporte',    defaultWidth: 100, minWidth: 70  },
  { key: 'carga',                label: 'Carga',         defaultWidth: 80,  minWidth: 55  },
  { key: 'region',               label: 'Región',        defaultWidth: 200, minWidth: 90  },
  { key: 'comuna',               label: 'Comuna',        defaultWidth: 95,  minWidth: 60  },
  { key: 'supervisor',           label: 'Supervisor',    defaultWidth: 130, minWidth: 70  },
  { key: 'guia',                 label: 'Guía',          defaultWidth: 95,  minWidth: 60  },
  { key: 'valor',                label: 'Valor',         defaultWidth: 90,  minWidth: 60  },
  { key: 'fuente',               label: 'Fuente',        defaultWidth: 90,  minWidth: 60  },
  { key: 'pioneta_1',            label: 'Pioneta 1',     defaultWidth: 120, minWidth: 70  },
  { key: 'pioneta_2',            label: 'Pioneta 2',     defaultWidth: 120, minWidth: 70  },
  { key: 'conductor_original',   label: 'Cond. orig.',   defaultWidth: 130, minWidth: 80  },
  { key: 'conductor_modificado', label: 'Modif.',        defaultWidth: 75,  minWidth: 55  },
];

const REC_COLS: ColDef[] = [
  { key: 'created_at',        label: 'Fecha/Hora',  defaultWidth: 130, minWidth: 90  },
  { key: 'cod',               label: 'Cod',         defaultWidth: 80,  minWidth: 50  },
  { key: 'tienda',            label: 'Tienda',      defaultWidth: 170, minWidth: 80  },
  { key: 'pallets_sent',      label: 'P. Env',      defaultWidth: 65,  minWidth: 45  },
  { key: 'bultos_sent',       label: 'B. Env',      defaultWidth: 65,  minWidth: 45  },
  { key: 'pallets_recibidos', label: 'P. Rec',      defaultWidth: 65,  minWidth: 45  },
  { key: 'bultos_recibidos',  label: 'B. Rec',      defaultWidth: 65,  minWidth: 45  },
  { key: 'conductor',         label: 'Conductor',   defaultWidth: 130, minWidth: 70  },
  { key: 'pionetas',          label: 'Pionetas',    defaultWidth: 140, minWidth: 80  },
  { key: 'receptor',          label: 'Receptor',    defaultWidth: 130, minWidth: 70  },
];

const ALL_COLS = [...RM_COLS, ...REC_COLS];

// ── Default visible sets ──────────────────────────────────────────────────────
const DEFAULT_VISIBLE_DISP = new Set([
  'fecha', 'cod', 'tienda', 'tipo', 'n_pallet_bulto',
  'peso_kg', 'conductor', 'ruta', 'estado', 'seguimiento',
]);
const DEFAULT_VISIBLE_REC = new Set(REC_COLS.map(c => c.key));

const LS_DISP = 'estado_vcols_disp';
const LS_REC  = 'estado_vcols_rec';

function loadVisibleCols(key: string, defaults: Set<string>): Set<string> {
  if (typeof window === 'undefined') return new Set(defaults);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set(defaults);
    const arr = JSON.parse(raw) as string[];
    return arr.length ? new Set(arr) : new Set(defaults);
  } catch { return new Set(defaults); }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const SEG_STYLE: Record<string, { bg: string; color: string; dot: string }> = {
  'Registrado': { bg: 'rgba(138,148,166,0.12)', color: '#8A94A6', dot: '#8A94A6' },
  'Pendiente':  { bg: 'rgba(194,77,77,0.12)',   color: '#C24D4D', dot: '#C24D4D' },
  'En camino':  { bg: 'rgba(181,136,43,0.14)',  color: '#B5882B', dot: '#B5882B' },
  'Entregado':  { bg: 'rgba(91,95,184,0.12)',   color: '#5B5FB8', dot: '#5B5FB8' },
  'Recibido':   { bg: 'rgba(54,153,106,0.13)',  color: '#36996A', dot: '#36996A' },
  'Diferencia': { bg: 'rgba(194,106,58,0.13)',  color: '#C26A3A', dot: '#C26A3A' },
};

const SUMMARY_KEYS = ['Registrado', 'Pendiente', 'En camino', 'Entregado', 'Recibido', 'Diferencia'];

// ── Small components ──────────────────────────────────────────────────────────
function Badge({ value }: { value: string }) {
  const s = SEG_STYLE[value] ?? { bg: 'rgba(0,0,0,0.06)', color: '#6B7280', dot: '#9CA3AF' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {value || '—'}
    </span>
  );
}

function TipoBadge({ value }: { value: string }) {
  const p = value === 'Pallet', ch = value === 'Chocolate', c = value === 'Contenedor';
  const bg    = p ? 'rgba(37,99,235,0.10)'  : ch ? 'rgba(120,53,15,0.10)'  : c ? 'rgba(6,182,212,0.10)'  : 'rgba(217,119,6,0.10)';
  const color = p ? '#1D4ED8'               : ch ? '#78350F'               : c ? '#0891B2'               : '#D97706';
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: bg, color, whiteSpace: 'nowrap' }}>{value}</span>;
}

function CargaBadge({ value }: { value: string }) {
  const isHogar = value === 'Hogar', isComida = value === 'Comida';
  const bg    = isHogar ? 'rgba(99,102,241,0.10)' : isComida ? 'rgba(16,185,129,0.10)' : 'rgba(156,163,175,0.12)';
  const color = isHogar ? '#6366F1'               : isComida ? '#10B981'               : '#6B7280';
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: bg, color, whiteSpace: 'nowrap' }}>{value}</span>;
}

// ── Recepcion detail modal ────────────────────────────────────────────────────
function PhotoThumb({ url, label, hora }: { url: string; label: string; hora?: string }) {
  if (!url) return null;
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', position: 'relative', borderRadius: 10, overflow: 'hidden', textDecoration: 'none' }}>
        <img src={url} alt={label} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
        {hora && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', padding: '4px 6px', fontSize: 10, color: '#fff', fontWeight: 700 }}>🕐 {hora}</div>}
        <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.5)', borderRadius: 6, padding: '2px 6px', fontSize: 10, color: '#fff' }}>↗</div>
      </a>
    </div>
  );
}

function RecepcionModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const palletsSent = Number(row.pallets_sent ?? 0);
  const bultosSent  = Number(row.bultos_sent  ?? 0);
  const palletsRec  = Number(row.pallets_recibidos ?? 0);
  const bultosRec   = Number(row.bultos_recibidos  ?? 0);
  const match       = palletsRec === palletsSent && bultosRec === bultosSent;
  const estadoFotos = (row.estado_fotos as string[]) ?? [];
  const fechaHora   = row.created_at ? new Date(String(row.created_at)).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, overflowY: 'auto', padding: '20px 16px 40px' }}>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: 480, margin: '0 auto', background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>

        <div style={{ background: 'linear-gradient(135deg,#1B2A6B,#2D3F8C)', padding: '18px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Detalle recepción</div>
            <div style={{ color: '#fff', fontSize: 26, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1 }}>{String(row.cod ?? '')}</div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: 600, marginTop: 4 }}>{String(row.tienda ?? '')}</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 }}>{fechaHora}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X size={16} color="rgba(255,255,255,0.8)" />
          </button>
        </div>

        <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ background: match ? 'rgba(16,185,129,0.08)' : 'rgba(249,115,22,0.08)', borderRadius: 14, padding: '14px 16px', border: `1px solid ${match ? 'rgba(16,185,129,0.3)' : 'rgba(249,115,22,0.3)'}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: match ? '#10B981' : '#F97316', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              {match ? '✅ Sin diferencia' : '⚠️ Diferencia detectada'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>ENVIADO</div><div /><div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>RECIBIDO</div>
              {palletsSent > 0 && <><div style={{ fontSize: 20, fontWeight: 800, color: '#1B2A6B' }}>{palletsSent}</div><div style={{ fontSize: 11, color: '#9CA3AF', alignSelf: 'center' }}>pallets</div><div style={{ fontSize: 20, fontWeight: 800, color: palletsRec === palletsSent ? '#10B981' : '#EF4444' }}>{palletsRec}</div></>}
              {bultosSent  > 0 && <><div style={{ fontSize: 20, fontWeight: 800, color: '#D97706' }}>{bultosSent}</div><div style={{ fontSize: 11, color: '#9CA3AF', alignSelf: 'center' }}>bultos</div><div style={{ fontSize: 20, fontWeight: 800, color: bultosRec === bultosSent ? '#10B981' : '#EF4444' }}>{bultosRec}</div></>}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Personal</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {!!row.conductor && <div style={{ background: '#F8FAFF', borderRadius: 10, padding: '10px 12px' }}><div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, marginBottom: 2 }}>CONDUCTOR</div><div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>{String(row.conductor)}</div></div>}
              {!!(row.pionetas && String(row.pionetas).trim()) && <div style={{ background: '#F8FAFF', borderRadius: 10, padding: '10px 12px' }}><div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, marginBottom: 2 }}>PIONETA(S)</div><div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>{String(row.pionetas)}</div></div>}
              {!!row.receptor && <div style={{ background: '#F8FAFF', borderRadius: 10, padding: '10px 12px' }}><div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, marginBottom: 2 }}>RECEPTOR</div><div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>{String(row.receptor)}</div>{!!row.rut && <div style={{ fontSize: 11, color: '#6B7280', fontFamily: 'monospace', marginTop: 2 }}>{String(row.rut)}</div>}</div>}
              {!!row.sello_estado && <div style={{ background: '#F8FAFF', borderRadius: 10, padding: '10px 12px' }}><div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, marginBottom: 2 }}>ESTADO SELLO</div><div style={{ fontSize: 13, fontWeight: 700, color: row.sello_estado === 'intacto' ? '#10B981' : '#EF4444' }}>{String(row.sello_estado).charAt(0).toUpperCase() + String(row.sello_estado).slice(1)}</div></div>}
            </div>
          </div>

          {!!(row.sello_llegada_url || row.sello_salida_url || row.cd_salida_url) && <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Trazabilidad de sellos</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <PhotoThumb url={String(row.cd_salida_url ?? '')}     label="CD Salida"     hora={String(row.cd_salida_hora ?? '')} />
              <PhotoThumb url={String(row.sello_llegada_url ?? '')} label="Sello llegada" hora={String(row.sello_llegada_hora ?? '')} />
              <PhotoThumb url={String(row.sello_salida_url ?? '')}  label="Sello salida"  hora={String(row.sello_salida_hora ?? '')} />
            </div>
          </div>}

          {estadoFotos.length > 0 && <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Fotos de estado ({estadoFotos.length})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {estadoFotos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', position: 'relative', borderRadius: 10, overflow: 'hidden', textDecoration: 'none' }}>
                  <img src={url} alt={`estado ${i + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', top: 4, left: 6, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 5 }}>#{i + 1}</div>
                </a>
              ))}
            </div>
          </div>}

          {!!row.firma_url && <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Firma del receptor</div>
            <a href={String(row.firma_url)} target="_blank" rel="noopener noreferrer">
              <img src={String(row.firma_url)} alt="firma" style={{ width: '100%', maxHeight: 120, objectFit: 'contain', background: '#F8FAFF', borderRadius: 10, border: '1px solid #E5E7EB', display: 'block' }} />
            </a>
          </div>}

          {!!(row.observaciones && String(row.observaciones).trim()) && <div style={{ background: '#FFFBEB', borderRadius: 12, padding: '12px 14px', border: '1px solid #FDE68A' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Observaciones</div>
            <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.5 }}>{String(row.observaciones)}</div>
          </div>}

          {!!row.codigo_verificacion && <div style={{ background: '#F0F4FF', borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#1B2A6B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Código OTP verificado</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1B2A6B', fontFamily: 'monospace', letterSpacing: '0.3em' }}>{String(row.codigo_verificacion)}</div>
          </div>}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function initColWidths(): Record<string, number> {
  const w: Record<string, number> = {};
  for (const c of ALL_COLS) w[c.key] = c.defaultWidth;
  return w;
}

// ── Column visibility menu ────────────────────────────────────────────────────
function ColMenu({
  cols, visibleCols, defaultVisible, onToggle, onReset, onClose,
}: {
  cols:         ColDef[];
  visibleCols:  Set<string>;
  defaultVisible: Set<string>;
  onToggle:     (key: string) => void;
  onReset:      () => void;
  onClose:      () => void;
}) {
  const firstExtra = cols.findIndex(c => !defaultVisible.has(c.key));

  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
      background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
      boxShadow: '0 8px 32px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.06)',
      width: 230, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 8px', borderBottom: '1px solid #F1F5F9' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Columnas visibles</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2, display: 'flex', alignItems: 'center' }}>
          <X size={14} />
        </button>
      </div>

      {/* Column list */}
      <div style={{ maxHeight: 340, overflowY: 'auto', padding: '6px 0' }}>
        {cols.map((col, i) => {
          const checked = visibleCols.has(col.key);
          const isFirstExtra = i === firstExtra && firstExtra > 0;
          return (
            <div key={col.key}>
              {isFirstExtra && (
                <div style={{ margin: '4px 12px 2px', paddingTop: 6, borderTop: '1px solid #F1F5F9' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Adicionales</span>
                </div>
              )}
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 14px', cursor: 'pointer',
                transition: 'background 0.1s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F8FAFF'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                  border: `2px solid ${checked ? '#1B2A6B' : '#D1D5DB'}`,
                  background: checked ? '#1B2A6B' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.12s',
                  cursor: 'pointer',
                }} onClick={() => onToggle(col.key)}>
                  {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
                <span style={{ fontSize: 13, color: checked ? '#1F2937' : '#6B7280', fontWeight: checked ? 600 : 400, userSelect: 'none' }}
                  onClick={() => onToggle(col.key)}>
                  {col.label}
                </span>
              </label>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #F1F5F9', padding: '8px 12px' }}>
        <button onClick={onReset} style={{
          width: '100%', padding: '7px 0', borderRadius: 8, border: '1px solid #E5E7EB',
          background: '#F9FAFB', color: '#6B7280', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', transition: 'background 0.12s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F1F5F9'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F9FAFB'; }}>
          Restaurar por defecto
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function SeguimientoPanel({ canSync = true }: { canSync?: boolean }) {
  const [subTab,         setSubTab]         = useState<SubTab>('rm');
  const [rows,           setRows]           = useState<Row[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [syncing,        setSyncing]        = useState(false);
  const [error,          setError]          = useState('');
  const [date,           setDate]           = useState('');
  const [search,         setSearch]         = useState('');
  const [selectedRow,    setSelectedRow]    = useState<Row | null>(null);
  const [colWidths,      setColWidths]      = useState<Record<string, number>>(initColWidths);
  const [menuOpen,       setMenuOpen]       = useState(false);
  const [visibleColsDisp, setVisibleColsDisp] = useState<Set<string>>(() => loadVisibleCols(LS_DISP, DEFAULT_VISIBLE_DISP));
  const [visibleColsRec,  setVisibleColsRec]  = useState<Set<string>>(() => loadVisibleCols(LS_REC,  DEFAULT_VISIBLE_REC));

  const dragRef = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isRecepcion = subTab === 'recepcion';
  const tabCfg      = SUB_TABS.find(t => t.key === subTab)!;
  const cols        = isRecepcion ? REC_COLS : RM_COLS;
  const visibleCols = isRecepcion ? visibleColsRec : visibleColsDisp;
  const defaultVisible = isRecepcion ? DEFAULT_VISIBLE_REC : DEFAULT_VISIBLE_DISP;
  const activeCols  = cols.filter(c => visibleCols.has(c.key));

  // ── Column visibility ──────────────────────────────────────────────────────
  function toggleCol(key: string) {
    const current = isRecepcion ? visibleColsRec : visibleColsDisp;
    if (current.has(key) && current.size <= 1) return; // keep at least 1
    const next = new Set(current);
    next.has(key) ? next.delete(key) : next.add(key);
    if (isRecepcion) { setVisibleColsRec(next); localStorage.setItem(LS_REC,  JSON.stringify([...next])); }
    else             { setVisibleColsDisp(next); localStorage.setItem(LS_DISP, JSON.stringify([...next])); }
  }

  function resetCols() {
    if (isRecepcion) { setVisibleColsRec(new Set(DEFAULT_VISIBLE_REC));   localStorage.removeItem(LS_REC);  }
    else             { setVisibleColsDisp(new Set(DEFAULT_VISIBLE_DISP)); localStorage.removeItem(LS_DISP); }
  }

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // ── Data ───────────────────────────────────────────────────────────────────
  const load = useCallback(async (): Promise<Row[]> => {
    setLoading(true); setError(''); setRows([]);
    try {
      const res  = await fetch(`/api/despacho-records?table=${encodeURIComponent(tabCfg.table)}`);
      const json = await res.json() as { data?: Row[]; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRows(json.data ?? []);
      return json.data ?? [];
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
      return [];
    } finally { setLoading(false); }
  }, [tabCfg.table]);

  const silentLoad = useCallback(async () => {
    try {
      const res  = await fetch(`/api/despacho-records?table=${encodeURIComponent(tabCfg.table)}`);
      const json = await res.json() as { data?: Row[] };
      if (res.ok) setRows(json.data ?? []);
    } catch {}
  }, [tabCfg.table]);

  const syncFromSheets = useCallback(async () => {
    setSyncing(true);
    try { await fetch('/api/sync-despacho', { method: 'POST' }); await load(); }
    finally { setSyncing(false); }
  }, [load]);

  const didAutoSync = useRef<Record<string, boolean>>({});
  useEffect(() => {
    load().then(loaded => {
      if (loaded.length === 0 && subTab !== 'recepcion' && !didAutoSync.current[subTab]) {
        didAutoSync.current[subTab] = true;
        syncFromSheets();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useRealtimeRefresh(tabCfg.table, silentLoad);

  // ── Column resize ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = e.clientX - dragRef.current.startX;
      const def   = ALL_COLS.find(c => c.key === dragRef.current!.key);
      const min   = def?.minWidth ?? 40;
      setColWidths(prev => ({ ...prev, [dragRef.current!.key]: Math.max(min, dragRef.current!.startW + delta) }));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, []);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const displayDate = date ? isoToDisplay(date) : '';
  const filtered = rows.filter(r => {
    const matchDate = !date || (
      isRecepcion
        ? String(r.created_at ?? '').startsWith(date)
        : String(r.fecha ?? '') === displayDate
    );
    const matchSearch = !search || cols.some(c =>
      String(r[c.key] ?? '').toLowerCase().includes(search.toLowerCase())
    );
    return matchDate && matchSearch;
  });

  const counts = SUMMARY_KEYS.reduce<Record<string, number>>((acc, k) => {
    acc[k] = filtered.filter(r => String(r.seguimiento ?? '') === k).length;
    return acc;
  }, {});

  const totalColWidth = activeCols.reduce((s, c) => s + (colWidths[c.key] ?? c.defaultWidth), 0);

  // ── Cell renderer ──────────────────────────────────────────────────────────
  function renderCell(col: ColDef, row: Row) {
    const val = row[col.key];
    if (col.key === 'seguimiento') return <Badge value={String(val ?? '')} />;
    if (col.key === 'tipo')        return <TipoBadge value={String(val ?? '')} />;
    if (col.key === 'carga')       return val ? <CargaBadge value={String(val)} /> : <span style={{ color: '#C0C7D4' }}>—</span>;
    if (col.key === 'cod')         return <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: '#1B2A6B' }}>{String(val ?? '')}</span>;
    if (col.key === 'valor' && val != null) return <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#374151' }}>{Number(val).toLocaleString('es-CL')}</span>;
    if (col.key === 'conductor_modificado') {
      return val
        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#EA580C', background: 'rgba(249,115,22,0.12)', padding: '2px 8px', borderRadius: 99 }}>● Modif.</span>
        : <span style={{ color: '#C0C7D4' }}>—</span>;
    }
    if (col.key === 'created_at' && val) {
      const d = new Date(String(val));
      return `${d.toLocaleDateString('es-CL')} ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (['pallets_sent','bultos_sent','pallets_recibidos','bultos_recibidos'].includes(col.key) && val != null) {
      return <span style={{ fontWeight: 700, color: '#1B2A6B' }}>{String(val)}</span>;
    }
    return <span style={{ color: val ? '#374151' : '#C0C7D4' }}>{val ? String(val) : '—'}</span>;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg">

      {/* Alertas de combinación de pallets — reimpresión */}
      <CombineAlertsPanel />

      {/* Sub-tabs */}
      <div className="flex-shrink-0 flex gap-2 px-4 pt-3 pb-2 border-b border-border bg-white">
        {SUB_TABS.map(t => {
          const active = subTab === t.key;
          return (
            <button key={t.key} onClick={() => { setSubTab(t.key); setSearch(''); setMenuOpen(false); }}
              className="px-4 py-2 rounded-xl text-[13px] font-bold cursor-pointer transition-all border"
              style={active
                ? { background: t.activeBg, borderColor: t.color + '55', color: t.color }
                : { background: 'transparent', borderColor: '#E5E7EB', color: '#9CA3AF' }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-border bg-white flex flex-wrap gap-2.5 items-center">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-text-3 uppercase tracking-wider">Fecha</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border border-border rounded-lg px-2 py-1.5 text-[13px] text-text focus:outline-none focus:border-navy" />
          {date && (
            <button onClick={() => setDate('')}
              className="text-[12px] text-text-3 hover:text-red cursor-pointer border-none bg-transparent leading-none">✕</button>
          )}
        </div>

        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cod, tienda, estado…"
          className="flex-1 min-w-[160px] border border-border rounded-lg px-3 py-1.5 text-[13px] text-text focus:outline-none focus:border-navy" />

        <button onClick={load}
          className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-navy border border-navy/30 cursor-pointer hover:bg-[rgba(27,42,107,0.06)] transition-colors">
          ↺ Actualizar
        </button>
        {canSync && !isRecepcion && (
          <button onClick={syncFromSheets} disabled={syncing}
            className="px-3 py-1.5 rounded-lg text-[12px] font-bold border cursor-pointer transition-colors disabled:opacity-50"
            style={{ color: '#10B981', borderColor: 'rgba(16,185,129,0.3)' }}>
            {syncing ? 'Sincronizando…' : '⇅ Sheets'}
          </button>
        )}

        {/* Column visibility menu */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="px-3 py-1.5 rounded-lg text-[12px] font-bold border cursor-pointer transition-colors flex items-center gap-1.5"
            style={menuOpen
              ? { background: 'rgba(27,42,107,0.08)', borderColor: '#1B2A6B', color: '#1B2A6B' }
              : { background: 'transparent', borderColor: '#E5E7EB', color: '#6B7280' }}>
            <span style={{ fontSize: 14, lineHeight: 1 }}>☰</span>
            <span>Columnas</span>
            <span style={{ fontSize: 11, color: menuOpen ? '#1B2A6B' : '#9CA3AF' }}>
              {activeCols.length}/{cols.length}
            </span>
          </button>

          {menuOpen && (
            <ColMenu
              cols={cols}
              visibleCols={visibleCols}
              defaultVisible={defaultVisible}
              onToggle={toggleCol}
              onReset={resetCols}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>

      {/* KPI cards — rm / regiones only */}
      {!isRecepcion && (
        <div className="flex-shrink-0 flex gap-2.5 px-4 py-2.5 overflow-x-auto border-b border-border">
          {SUMMARY_KEYS.map(k => {
            const s = SEG_STYLE[k]!;
            return (
              <div key={k} className="flex-shrink-0 flex items-center gap-2.5 px-3.5 py-2 rounded-xl border"
                style={{ background: s.bg, borderColor: s.color + '44', minWidth: 100 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.color, lineHeight: 1 }}>{counts[k] ?? 0}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: s.color + 'CC', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
                </div>
              </div>
            );
          })}
          <div className="flex-shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-white ml-auto">
            <div>
              <div className="text-[18px] font-extrabold text-navy leading-none">{filtered.length}</div>
              <div className="text-[10px] font-semibold text-text-3 uppercase tracking-wider">Total</div>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 pb-4 pt-3">
        {loading && <div className="text-center text-text-3 py-16 text-sm">Cargando datos…</div>}
        {error && (
          <div className="mx-auto max-w-md mt-8 p-4 rounded-xl text-sm text-red-700 font-medium"
               style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            ⚠️ {error}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-20 px-8">
            <div className="text-4xl mb-3 opacity-20">📦</div>
            <p className="text-text-2 font-semibold text-[15px] mb-1">
              {rows.length > 0 ? 'Sin resultados para los filtros aplicados' : 'Sin registros todavía'}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="rounded-2xl overflow-hidden border border-border bg-white">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ tableLayout: 'fixed', borderCollapse: 'collapse', width: totalColWidth }}>
                <colgroup>
                  {activeCols.map(c => <col key={c.key} style={{ width: colWidths[c.key] ?? c.defaultWidth }} />)}
                </colgroup>
                <thead>
                  <tr style={{ background: 'rgba(27,42,107,0.05)' }}>
                    {activeCols.map(col => (
                      <th key={col.key} style={{
                        position: 'relative', padding: '10px 12px', textAlign: 'left',
                        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.05em', color: '#1B2A6B',
                        borderBottom: '1px solid rgba(27,42,107,0.12)',
                        userSelect: 'none', whiteSpace: 'nowrap', overflow: 'hidden',
                      }}>
                        {col.label}
                        <div
                          onMouseDown={e => {
                            e.preventDefault();
                            dragRef.current = { key: col.key, startX: e.clientX, startW: colWidths[col.key] ?? col.defaultWidth };
                          }}
                          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(27,42,107,0.22)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                          <div style={{ width: 1, height: '55%', background: 'rgba(27,42,107,0.35)', borderRadius: 1 }} />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr key={String(row.id ?? i)}
                      onClick={isRecepcion ? () => setSelectedRow(row) : undefined}
                      style={{ cursor: isRecepcion ? 'pointer' : 'default', borderBottom: '1px solid #F1F5F9' }}
                      onMouseEnter={e  => { (e.currentTarget as HTMLElement).style.background = 'rgba(27,42,107,0.025)'; }}
                      onMouseLeave={e  => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      {activeCols.map(col => (
                        <td key={col.key} style={{ padding: '9px 12px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          {renderCell(col, row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 text-[11px] text-text-3 border-t border-border flex items-center gap-1.5">
              <span>{filtered.length} registros{date ? ` · ${displayDate}` : ''}</span>
              <span className="opacity-40">·</span>
              <span className="opacity-60">Arrastra el borde de columna para redimensionar · ☰ Columnas para mostrar/ocultar</span>
            </div>
          </div>
        )}
      </div>

      {selectedRow && <RecepcionModal row={selectedRow} onClose={() => setSelectedRow(null)} />}
    </div>
  );
}
