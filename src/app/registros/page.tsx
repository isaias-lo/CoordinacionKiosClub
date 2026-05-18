'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Truck, MapPin, Store } from 'lucide-react';
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
  'Registrado':{ bg: 'rgba(148,163,184,0.15)',  color: '#94A3B8' },
  'Pendiente': { bg: 'rgba(239,68,68,0.15)',    color: '#EF4444' },
  'En camino': { bg: 'rgba(234,179,8,0.18)',    color: '#EAB308' },
  'Recibido':  { bg: 'rgba(16,185,129,0.15)',   color: '#10B981' },
  'Diferencia':{ bg: 'rgba(245,158,11,0.15)',   color: '#F97316' },
};

// Columns to show per table (order matters)
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
    'pallets_recibidos','bultos_recibidos','receptor','rut',
  ],
};

const COL_LABEL: Record<string, string> = {
  fecha: 'Fecha', cod: 'Cod', tienda: 'Tienda', tipo: 'Tipo', regimen: 'Régimen',
  carga: 'Carga', region: 'Región', comuna: 'Comuna', peso_kg: 'Peso kg',
  estado: 'Estado', n_pallet_bulto: 'N°', conductor: 'Conductor', ruta: 'Ruta',
  supervisor: 'Supervisor', seguimiento: 'Seguimiento', guia: 'Guía', valor: 'Valor',
  created_at: 'Fecha/Hora', pallets_sent: 'P. Enviados', bultos_sent: 'B. Enviados',
  pallets_recibidos: 'P. Recibidos', bultos_recibidos: 'B. Recibidos',
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

export default function RegistrosPage() {
  const router  = useRouter();
  const [tab,     setTab]     = useState<TabKey>('rm');
  const [rows,    setRows]    = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');

  const tabCfg   = TABS.find(t => t.key === tab)!;
  const cols      = TABLE_COLS[tab];
  const color     = TAB_COLORS[tab];

  const loadData = useCallback(async (table: string) => {
    setLoading(true);
    setError('');
    setRows([]);
    try {
      const res  = await fetch(`/api/despacho-records?table=${encodeURIComponent(table)}`);
      const data = await res.json() as { data?: Record<string, unknown>[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRows(data.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  // Silent refresh (no loading spinner, no row clear) used by Realtime subscription
  const silentRefresh = useCallback(async () => {
    try {
      const res  = await fetch(`/api/despacho-records?table=${encodeURIComponent(tabCfg.table)}`);
      const data = await res.json() as { data?: Record<string, unknown>[] };
      if (res.ok) setRows(data.data ?? []);
    } catch {}
  }, [tabCfg.table]);

  useEffect(() => { loadData(tabCfg.table); }, [tab, tabCfg.table, loadData]);

  // Auto-refresh when another user inserts/updates a row in the active table
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
          style={{
            width: 36, height: 36,
            background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)',
          }}>
          <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
        </button>
        <div className="flex-1">
          <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase">
            Registros de Despacho
          </div>
          <div className="text-[11px] text-white/40 uppercase tracking-widest">
            {loading ? 'Cargando…' : `${filtered.length} registros`}
          </div>
        </div>
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

      {/* Seguimiento legend (only for dispatch tabs) */}
      {tab !== 'recepcion' && (
        <div className="flex-shrink-0 flex gap-2 px-4 py-2 flex-wrap">
          {Object.entries(SEGUIMIENTO_STYLE).map(([estado, s]) => (
            <span key={estado} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
              background: s.bg, color: s.color,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
              {estado}
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="flex-shrink-0 px-4 py-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por tienda, cod, estado…"
          className="w-full px-3 py-2 rounded-xl text-[14px] text-white placeholder:text-white/30 focus:outline-none border border-white/10 focus:border-white/25 transition-colors"
          style={{ background: 'rgba(255,255,255,0.07)' }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        {loading && <div className="text-center text-white/40 py-16 text-sm">Cargando datos…</div>}
        {error   && (
          <div className="text-sm text-red-400 text-center py-4 rounded-xl mb-4"
               style={{ background: 'rgba(211,47,47,0.1)' }}>{error}</div>
        )}
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
                        className="border-b transition-colors hover:bg-white/5"
                        style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
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
            <div className="px-4 py-2 text-[11px] text-white/30 border-t"
                 style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              {filtered.length} registros · {tabCfg.label}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
