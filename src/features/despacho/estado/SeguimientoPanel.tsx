'use client';

import { useEffect, useState, useCallback } from 'react';

interface DespachoRow {
  id: string;
  fecha: string;
  cod: string;
  tienda: string;
  tipo: string;
  n_pallet_bulto: string;
  estado: string;
  seguimiento: string;
  conductor?: string;
  ruta?: string;
  guia?: string;
  created_at: string;
}

const SEG_STYLE: Record<string, { bg: string; color: string; dot: string }> = {
  'Registrado': { bg: 'rgba(148,163,184,0.15)', color: '#94A3B8', dot: '#94A3B8' },
  'Pendiente':  { bg: 'rgba(239,68,68,0.15)',   color: '#EF4444', dot: '#EF4444' },
  'En camino':  { bg: 'rgba(234,179,8,0.18)',   color: '#EAB308', dot: '#EAB308' },
  'Recibido':   { bg: 'rgba(16,185,129,0.15)',  color: '#10B981', dot: '#10B981' },
  'Diferencia': { bg: 'rgba(249,115,22,0.15)',  color: '#F97316', dot: '#F97316' },
};

function Badge({ value }: { value: string }) {
  const s = SEG_STYLE[value] ?? { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', dot: 'rgba(255,255,255,0.3)' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {value || '—'}
    </span>
  );
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toDisplayDate(iso: string): string {
  // iso: YYYY-MM-DD
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function SeguimientoPanel() {
  const [rows,    setRows]    = useState<DespachoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [date,    setDate]    = useState(todayStr());
  const [search,  setSearch]  = useState('');
  const [source,  setSource]  = useState<'ambos' | 'rm' | 'regiones'>('ambos');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const tables = source === 'rm'
        ? ['despacho_rm']
        : source === 'regiones'
          ? ['despacho_regiones']
          : ['despacho_rm', 'despacho_regiones'];

      const results = await Promise.all(
        tables.map(async t => {
          const res = await fetch(`/api/despacho-records?table=${t}`);
          if (!res.ok) throw new Error(`HTTP ${res.status} al cargar ${t}`);
          const json = await res.json() as { data?: DespachoRow[]; error?: string };
          if (json.error) throw new Error(json.error);
          return json.data ?? [];
        })
      );
      setRows(results.flat());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => { load(); }, [load]);

  const displayDate = toDisplayDate(date); // DD/MM/YYYY para comparar con campo `fecha`

  const filtered = rows.filter(r => {
    const matchDate   = !date   || r.fecha === displayDate;
    const matchSearch = !search || [r.cod, r.tienda, r.seguimiento, r.tipo, r.n_pallet_bulto]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));
    return matchDate && matchSearch;
  });

  // Summary counts
  const counts = filtered.reduce<Record<string, number>>((acc, r) => {
    acc[r.seguimiento] = (acc[r.seguimiento] || 0) + 1;
    return acc;
  }, {});

  const SUMMARY = [
    { key: 'Registrado', label: 'Registrado', ...SEG_STYLE['Registrado'] },
    { key: 'Pendiente',  label: 'Pendiente',  ...SEG_STYLE['Pendiente']  },
    { key: 'En camino',  label: 'En camino',  ...SEG_STYLE['En camino']  },
    { key: 'Recibido',   label: 'Recibido',   ...SEG_STYLE['Recibido']   },
    { key: 'Diferencia', label: 'Diferencia', ...SEG_STYLE['Diferencia'] },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg">

      {/* Filters bar */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-white flex flex-wrap gap-3 items-center">

        {/* Date picker */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-text-3 uppercase tracking-wider">Fecha</span>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="border border-border rounded-lg px-2 py-1.5 text-[13px] text-text focus:outline-none focus:border-navy"
          />
          <button
            onClick={() => setDate('')}
            className="text-[11px] text-text-3 hover:text-red cursor-pointer border-none bg-transparent"
            title="Ver todos">
            Todas
          </button>
        </div>

        {/* Source toggle */}
        <div className="flex gap-1">
          {(['ambos', 'rm', 'regiones'] as const).map(s => (
            <button key={s} onClick={() => setSource(s)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer border transition-all"
              style={source === s
                ? { background: '#1B2A6B', color: '#fff', borderColor: '#1B2A6B' }
                : { background: 'transparent', color: '#6B7280', borderColor: '#E5E7EB' }}>
              {s === 'ambos' ? 'Ambos' : s === 'rm' ? 'Desp. RM' : 'Regiones'}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cod, tienda, estado…"
          className="flex-1 min-w-[160px] border border-border rounded-lg px-3 py-1.5 text-[13px] text-text focus:outline-none focus:border-navy"
        />

        <button onClick={load}
          className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-navy border border-navy/30 cursor-pointer hover:bg-[rgba(27,42,107,0.06)] transition-colors">
          ↺ Actualizar
        </button>
      </div>

      {/* Summary cards */}
      <div className="flex-shrink-0 flex gap-3 px-4 py-3 overflow-x-auto">
        {SUMMARY.map(s => (
          <div key={s.key}
            className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 rounded-xl border"
            style={{ background: s.bg, borderColor: s.color + '55', minWidth: 120 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1 }}>
                {counts[s.key] ?? 0}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: s.color + 'CC', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {s.label}
              </div>
            </div>
          </div>
        ))}

        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border bg-bg-2 ml-auto">
          <div>
            <div className="text-[20px] font-extrabold text-navy leading-none">{filtered.length}</div>
            <div className="text-[10px] font-semibold text-text-3 uppercase tracking-wider">Total</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 pb-4">
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
              {rows.length > 0 ? 'Sin resultados para los filtros aplicados' : 'Sin registros en Supabase todavía'}
            </p>
            {rows.length === 0 && (
              <p className="text-text-3 text-[13px] leading-relaxed mt-2">
                Los registros aparecen aquí cuando presionas<br />
                <strong>"Registrar despacho"</strong> en Bodega Santiago o <strong>"Terminar"</strong> en Bodega Regiones.
              </p>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="rounded-2xl overflow-hidden border border-border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="bg-[rgba(27,42,107,0.06)]">
                    {['Fecha', 'Cod', 'Tienda', 'Tipo', 'N°', 'Estado Despacho', 'Seguimiento'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left font-bold uppercase tracking-wider whitespace-nowrap text-navy text-[11px]"
                          style={{ borderBottom: '1px solid rgba(27,42,107,0.12)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr key={row.id ?? i}
                        className="border-b border-border hover:bg-[rgba(27,42,107,0.03)] transition-colors">
                      <td className="px-3 py-2.5 text-text-2 whitespace-nowrap font-mono text-[11px]">{row.fecha}</td>
                      <td className="px-3 py-2.5 font-barlow-condensed text-[15px] font-extrabold text-navy whitespace-nowrap">{row.cod}</td>
                      <td className="px-3 py-2.5 text-text font-semibold max-w-[180px] truncate">{row.tienda}</td>
                      <td className="px-3 py-2.5 text-text-2 whitespace-nowrap">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${row.tipo === 'Pallet' ? 'bg-[rgba(37,99,235,0.10)] text-info' : 'bg-[rgba(217,119,6,0.10)] text-warn'}`}>
                          {row.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-text-2 whitespace-nowrap font-mono">{row.n_pallet_bulto}</td>
                      <td className="px-3 py-2.5 text-text-2 whitespace-nowrap max-w-[160px] truncate">{row.estado}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap"><Badge value={row.seguimiento} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 text-[11px] text-text-3 border-t border-border">
              {filtered.length} registros{date ? ` · ${displayDate}` : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
