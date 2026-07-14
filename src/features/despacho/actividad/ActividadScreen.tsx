'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BodegaHeader } from '../shared/BodegaHeader';
import type { ActividadRow, FuenteActividad } from '@/lib/actividad';

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const FUENTE_LABEL: Record<FuenteActividad, string> = { nacional: 'Nacional', rmcosta: 'RM/Costa' };

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

export function ActividadScreen() {
  const [rows, setRows]       = useState<ActividadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fecha, setFecha]     = useState(localDate());
  const [fuente, setFuente]   = useState<'' | FuenteActividad>('');
  const [usuario, setUsuario] = useState('');
  const [tienda, setTienda]   = useState('');

  const filtersRef = useRef({ fecha, fuente });
  filtersRef.current = { fecha, fuente };

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ fecha });
    if (fuente) qs.set('fuente', fuente);
    try {
      const res  = await fetch(`/api/actividad?${qs.toString()}`);
      const json = await res.json() as { data?: ActividadRow[] };
      setRows(json.data ?? []);
    } catch (e) {
      console.error('[actividad load]', e);
    } finally {
      setLoading(false);
    }
  }, [fecha, fuente]);

  useEffect(() => { void load(); }, [load]);

  // Feed en vivo: al llegar un insert que coincide con los filtros de fecha/fuente activos, recargar.
  useEffect(() => {
    const ch = supabase
      .channel('actividad_bodega_feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'actividad_bodega' }, payload => {
        const r = payload.new as ActividadRow;
        const f = filtersRef.current;
        if (r.fecha === f.fecha && (!f.fuente || r.fuente === f.fuente)) void load();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  // Opciones de filtro derivadas de lo cargado.
  const usuarios = useMemo(
    () => [...new Set(rows.map(r => r.actor_name).filter((x): x is string => !!x))].sort(),
    [rows],
  );
  const tiendas = useMemo(
    () => [...new Set(rows.map(r => r.tienda_cod).filter((x): x is string => !!x))].sort(),
    [rows],
  );

  const visibles = rows.filter(r =>
    (!usuario || r.actor_name === usuario) &&
    (!tienda  || r.tienda_cod === tienda));

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      <BodegaHeader right={
        <div className="font-barlow-condensed text-[12px] text-white/60 tracking-wide leading-none flex-shrink-0 tabular-nums text-right">
          {visibles.length} reg.
        </div>
      } />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-white border-b border-bg-2 flex-shrink-0">
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          className="bg-white border border-border rounded px-2 py-1.5 text-[13px] text-text outline-none focus:border-red" />
        <select value={fuente} onChange={e => setFuente(e.target.value as '' | FuenteActividad)}
          className="bg-white border border-border rounded px-2 py-1.5 text-[13px] text-text outline-none focus:border-red">
          <option value="">Todas las fuentes</option>
          <option value="nacional">Nacional</option>
          <option value="rmcosta">RM / Costa</option>
        </select>
        <select value={usuario} onChange={e => setUsuario(e.target.value)}
          className="bg-white border border-border rounded px-2 py-1.5 text-[13px] text-text outline-none focus:border-red">
          <option value="">Todos los usuarios</option>
          {usuarios.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={tienda} onChange={e => setTienda(e.target.value)}
          className="bg-white border border-border rounded px-2 py-1.5 text-[13px] text-text outline-none focus:border-red">
          <option value="">Todas las tiendas</option>
          {tiendas.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {(usuario || tienda || fuente) && (
          <button onClick={() => { setUsuario(''); setTienda(''); setFuente(''); }}
            className="text-[12px] text-text-3 hover:text-red cursor-pointer border-none bg-transparent underline">
            limpiar
          </button>
        )}
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto min-h-0 px-2 py-2">
        {loading && rows.length === 0 ? (
          <div className="text-center text-text-3 text-[13px] py-10">Cargando actividad…</div>
        ) : visibles.length === 0 ? (
          <div className="text-center text-text-3 text-[13px] py-10">Sin actividad para estos filtros.</div>
        ) : (
          <div className="flex flex-col gap-1.5 max-w-3xl mx-auto">
            {visibles.map(r => (
              <div key={r.id} className="flex items-start gap-2.5 bg-white rounded-lg border border-bg-2 px-3 py-2">
                <div className="font-mono text-[12px] text-text-3 pt-0.5 tabular-nums flex-shrink-0 w-[42px]">{hora(r.created_at)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-text leading-snug">
                    <span className="font-bold text-navy">{r.actor_name ?? 'Usuario'}</span>{' '}
                    <span>{r.mensaje}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                      r.fuente === 'nacional'
                        ? 'text-[#6B21A8] bg-[rgba(107,33,168,0.10)]'
                        : 'text-info bg-[rgba(37,99,235,0.10)]'}`}>
                      {FUENTE_LABEL[r.fuente] ?? r.fuente}
                    </span>
                    {r.tienda_cod && (
                      <span className="text-[11px] text-text-3">
                        {r.tienda_cod}{r.tienda_nombre ? ` · ${r.tienda_nombre}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
