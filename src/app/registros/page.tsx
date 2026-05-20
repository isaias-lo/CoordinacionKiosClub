'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Truck, MapPin, Store, X } from 'lucide-react';
import { ProfilePill } from '@/components/ProfilePill';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import type { LucideIcon } from 'lucide-react';

type TabKey = 'rm' | 'regiones' | 'recepcion';

const TABS: { key: TabKey; label: string; table: string; Icon: LucideIcon }[] = [
  { key: 'rm',        label: 'Despacho RM',       table: 'despacho_rm',       Icon: Truck },
  { key: 'regiones',  label: 'Despacho Regiones',  table: 'despacho_regiones', Icon: MapPin },
  { key: 'recepcion', label: 'Recepción Tienda',   table: 'recepcion',         Icon: Store },
];

const TAB_COLORS: Record<TabKey, { bg: string; border: string; text: string }> = {
  rm:        { bg: 'rgba(37,99,235,0.15)',   border: 'rgba(37,99,235,0.4)',   text: '#3B82F6' },
  regiones:  { bg: 'rgba(211,47,47,0.15)',   border: 'rgba(211,47,47,0.4)',   text: '#EF4444' },
  recepcion: { bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.4)',  text: '#10B981' },
};

const SEGUIMIENTO_STYLE: Record<string, { bg: string; color: string }> = {
  'Registrado': { bg: 'rgba(148,163,184,0.15)', color: '#94A3B8' },
  'Pendiente':  { bg: 'rgba(239,68,68,0.15)',   color: '#EF4444' },
  'En camino':  { bg: 'rgba(234,179,8,0.18)',   color: '#EAB308' },
  'Entregado':  { bg: 'rgba(99,102,241,0.15)',  color: '#6366F1' },
  'Recibido':   { bg: 'rgba(16,185,129,0.15)',  color: '#10B981' },
  'Diferencia': { bg: 'rgba(245,158,11,0.15)',  color: '#F97316' },
};

const TABLE_COLS: Record<TabKey, string[]> = {
  rm: [
    'fecha','cod','tienda','tipo','regimen','carga','region','comuna',
    'peso_kg','estado','n_pallet_bulto','conductor','ruta','supervisor','seguimiento',
  ],
  regiones: [
    'fecha','cod','tienda','tipo','regimen','carga','region','comuna',
    'peso_kg','estado','n_pallet_bulto','guia','valor','seguimiento',
  ],
  recepcion: [
    'created_at','cod','tienda','pallets_sent','bultos_sent',
    'pallets_recibidos','bultos_recibidos','conductor','receptor','rut',
  ],
};

const COL_LABEL: Record<string, string> = {
  fecha: 'Fecha', cod: 'Cod', tienda: 'Tienda', tipo: 'Tipo', regimen: 'Régimen',
  carga: 'Carga', region: 'Región', comuna: 'Comuna', peso_kg: 'Peso kg',
  estado: 'Estado', n_pallet_bulto: 'N°', conductor: 'Conductor', ruta: 'Ruta',
  supervisor: 'Supervisor', seguimiento: 'Seguimiento', guia: 'Guía', valor: 'Valor',
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
    const d = new Date(String(val));
    return `${d.toLocaleDateString('es-CL')} ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return String(val ?? '');
}

// ── Recepcion detail modal ────────────────────────────────────────────────────

type RecepcionRow = Record<string, unknown>;

function formatHora(iso: string): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return iso; }
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
  const fechaHora   = row.created_at ? new Date(String(row.created_at)).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—';

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
              {row.conductor && (
                <div style={{ background: '#F8FAFF', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, marginBottom: 2 }}>CONDUCTOR</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>{String(row.conductor)}</div>
                </div>
              )}
              {row.pionetas && String(row.pionetas).trim() && (
                <div style={{ background: '#F8FAFF', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, marginBottom: 2 }}>PIONETA(S)</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>{String(row.pionetas)}</div>
                </div>
              )}
              {row.receptor && (
                <div style={{ background: '#F8FAFF', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, marginBottom: 2 }}>RECEPTOR</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>{String(row.receptor)}</div>
                  {row.rut && <div style={{ fontSize: 11, color: '#6B7280', fontFamily: 'monospace', marginTop: 2 }}>{String(row.rut)}</div>}
                </div>
              )}
              {row.sello_estado && (
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
          {(row.sello_llegada_url || row.sello_salida_url || row.cd_salida_url) && (
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
          {row.firma_url && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Firma del receptor</div>
              <a href={String(row.firma_url)} target="_blank" rel="noopener noreferrer">
                <img src={String(row.firma_url)} alt="firma" style={{ width: '100%', maxHeight: 120, objectFit: 'contain', background: '#F8FAFF', borderRadius: 10, border: '1px solid #E5E7EB', display: 'block' }} />
              </a>
            </div>
          )}

          {/* Observaciones */}
          {row.observaciones && String(row.observaciones).trim() && (
            <div style={{ background: '#FFFBEB', borderRadius: 12, padding: '12px 14px', border: '1px solid #FDE68A' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Observaciones</div>
              <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.5 }}>{String(row.observaciones)}</div>
            </div>
          )}

          {/* Código verificación */}
          {row.codigo_verificacion && (
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

  const tabCfg = TABS.find(t => t.key === tab)!;
  const cols   = TABLE_COLS[tab];
  const color  = TAB_COLORS[tab];

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
    if (tabCfg.key === 'recepcion') return;
    setSyncing(true);
    try {
      await fetch('/api/sync-despacho', { method: 'POST' });
      await loadData(tabCfg.table);
    } finally { setSyncing(false); }
  }, [tabCfg.key, tabCfg.table, loadData]);

  const didAutoSync = useRef<Record<string, boolean>>({});
  useEffect(() => {
    loadData(tabCfg.table).then(loaded => {
      if (loaded.length === 0 && tabCfg.key !== 'recepcion' && !didAutoSync.current[tabCfg.key]) {
        didAutoSync.current[tabCfg.key] = true;
        syncFromSheets();
      }
    });
  }, [tab, tabCfg.table, tabCfg.key, loadData, syncFromSheets]);

  useRealtimeRefresh(tabCfg.table, silentRefresh);

  const filtered = search.trim()
    ? rows.filter(r => cols.some(c => String(r[c] ?? '').toLowerCase().includes(search.toLowerCase())))
    : rows;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden"
         style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3"
           style={{ background: 'rgba(26,37,80,0.8)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button onClick={() => router.push('/despacho-hub')}
          className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
          style={{ width: 36, height: 36, background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)' }}>
          <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
        </button>
        <div className="flex-1">
          <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase">Registros de Despacho</div>
          <div className="text-[11px] text-white/40 uppercase tracking-widest">{loading ? 'Cargando…' : `${filtered.length} registros`}</div>
        </div>
        {tab !== 'recepcion' && (
          <button onClick={syncFromSheets} disabled={syncing}
            className="px-3 py-1.5 rounded-xl text-[13px] cursor-pointer hover:bg-white/10 transition-colors border border-white/10 disabled:opacity-50"
            style={{ color: '#10B981' }}>
            {syncing ? 'Sincronizando…' : '⇅ Sheets'}
          </button>
        )}
        <button onClick={() => loadData(tabCfg.table)}
          className="px-3 py-1.5 rounded-xl text-[13px] text-white/60 cursor-pointer hover:bg-white/10 transition-colors border border-white/10">
          ↺ Actualizar
        </button>
        <ProfilePill />
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex gap-2 px-4 pt-3 pb-1 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSearch(''); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-barlow-condensed text-[14px] font-bold uppercase tracking-wider cursor-pointer transition-all"
            style={tab === t.key
              ? { background: TAB_COLORS[t.key].bg, border: `1px solid ${TAB_COLORS[t.key].border}`, color: TAB_COLORS[t.key].text }
              : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}>
            <t.Icon size={13} strokeWidth={2} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Seguimiento legend */}
      {tab !== 'recepcion' && (
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
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Toca una fila para ver el detalle completo (fotos, sellos, firma)</span>
        </div>
      )}

      {/* Search */}
      <div className="flex-shrink-0 px-4 py-2">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por tienda, cod, estado…"
          className="w-full px-3 py-2 rounded-xl text-[14px] text-white placeholder:text-white/30 focus:outline-none border border-white/10 focus:border-white/25 transition-colors"
          style={{ background: 'rgba(255,255,255,0.07)' }} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        {loading && <div className="text-center text-white/40 py-16 text-sm">Cargando datos…</div>}
        {error && <div className="text-sm text-red-400 text-center py-4 rounded-xl mb-4" style={{ background: 'rgba(211,47,47,0.1)' }}>{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-center text-white/30 py-16 text-sm">
            {search ? 'Sin resultados para tu búsqueda' : 'No hay registros todavía'}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="rounded-2xl overflow-hidden"
               style={{ border: `1px solid ${color.border}`, background: 'rgba(255,255,255,0.03)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr style={{ background: color.bg }}>
                    {cols.map(c => (
                      <th key={c} className="px-3 py-2.5 text-left font-bold uppercase tracking-wider whitespace-nowrap"
                          style={{ color: color.text, borderBottom: `1px solid ${color.border}` }}>
                        {COL_LABEL[c] ?? c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, ri) => (
                    <tr key={ri}
                        onClick={() => tab === 'recepcion' ? setSelectedRow(row) : undefined}
                        className="border-b transition-colors hover:bg-white/5"
                        style={{ borderColor: 'rgba(255,255,255,0.05)', cursor: tab === 'recepcion' ? 'pointer' : 'default' }}>
                      {cols.map(c => (
                        <td key={c} className="px-3 py-2 text-white/80 whitespace-nowrap max-w-[200px] truncate">
                          {formatCell(c, row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 text-[11px] text-white/30 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              {filtered.length} registros · {tabCfg.label}
              {tab === 'recepcion' && ' · Toca una fila para ver detalle'}
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selectedRow && (
        <RecepcionDetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />
      )}
    </div>
  );
}
