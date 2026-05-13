'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type TabKey = 'regiones' | 'rm' | 'recepcion';

const SHEETS: Record<TabKey, string> = {
  regiones:  'DESPACHO REGIONES',
  rm:        'DESPACHO RM',
  recepcion: 'RECEPCIÓN TIENDA',
};

const COLORS: Record<TabKey, { bg: string; border: string; text: string }> = {
  regiones:  { bg: 'rgba(211,47,47,0.15)',   border: 'rgba(211,47,47,0.4)',   text: '#EF4444' },
  rm:        { bg: 'rgba(37,99,235,0.15)',   border: 'rgba(37,99,235,0.4)',   text: '#3B82F6' },
  recepcion: { bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.4)',  text: '#10B981' },
};

export default function RegistrosPage() {
  const router = useRouter();
  const [tab,     setTab]     = useState<TabKey>('regiones');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows,    setRows]    = useState<string[][]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');

  const loadSheet = useCallback(async (sheet: string) => {
    setLoading(true);
    setError('');
    setHeaders([]);
    setRows([]);
    try {
      const res  = await fetch(`/api/sheets?sheet=${encodeURIComponent(sheet)}`);
      const data = await res.json() as { values?: string[][]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const values = data.values ?? [];
      if (values.length === 0) { setLoading(false); return; }
      setHeaders(values[0]);
      setRows(values.slice(1).filter(r => r.some(c => c)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSheet(SHEETS[tab]); }, [tab, loadSheet]);

  const filtered = search.trim()
    ? rows.filter(r => r.some(c => c?.toLowerCase().includes(search.toLowerCase())))
    : rows;

  const color = COLORS[tab];

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden"
         style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3"
           style={{ background: 'rgba(26,37,80,0.8)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button onClick={() => router.push('/')}
          className="border-none bg-white/10 text-white/70 text-[13px] cursor-pointer px-3 py-1.5 rounded-full">
          ← Inicio
        </button>
        <div className="flex-1">
          <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase">
            Registros de Despacho
          </div>
          <div className="text-[11px] text-white/40 uppercase tracking-widest">
            {loading ? 'Cargando…' : `${filtered.length} registros`}
          </div>
        </div>
        <button onClick={() => loadSheet(SHEETS[tab])}
          className="px-3 py-1.5 rounded-xl text-[13px] text-white/60 cursor-pointer hover:bg-white/10 transition-colors border border-white/10">
          ↺ Actualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex gap-2 px-4 pt-3 pb-1">
        {(['regiones', 'rm', 'recepcion'] as TabKey[]).map(t => (
          <button key={t} onClick={() => { setTab(t); setSearch(''); }}
            className="px-4 py-2 rounded-xl font-barlow-condensed text-[14px] font-bold uppercase tracking-wider cursor-pointer transition-all"
            style={tab === t
              ? { background: COLORS[t].bg, border: `1px solid ${COLORS[t].border}`, color: COLORS[t].text }
              : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}>
            {t === 'regiones' ? 'Despacho Regiones' : t === 'rm' ? 'Despacho RM' : 'Recepción Tienda'}
          </button>
        ))}
      </div>

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
        {loading && (
          <div className="text-center text-white/40 py-16 text-sm">Cargando datos…</div>
        )}
        {error && (
          <div className="text-sm text-red-400 text-center py-4 rounded-xl mb-4"
               style={{ background: 'rgba(211,47,47,0.1)' }}>{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-center text-white/30 py-16 text-sm">
            {search ? 'Sin resultados para tu búsqueda' : 'No hay registros en esta hoja todavía'}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="rounded-2xl overflow-hidden"
               style={{ border: `1px solid ${color.border}`, background: 'rgba(255,255,255,0.03)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr style={{ background: color.bg }}>
                    {headers.map((h, i) => (
                      <th key={i} className="px-3 py-2.5 text-left font-bold uppercase tracking-wider whitespace-nowrap"
                          style={{ color: color.text, borderBottom: `1px solid ${color.border}` }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice().reverse().map((row, ri) => (
                    <tr key={ri}
                        className="border-b transition-colors hover:bg-white/5"
                        style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      {headers.map((_, ci) => (
                        <td key={ci} className="px-3 py-2 text-white/80 whitespace-nowrap max-w-[200px] truncate">
                          {row[ci] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-2 text-[11px] text-white/30 border-t"
                 style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              {filtered.length} registros · Hoja: {SHEETS[tab]}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
