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

// Verbo + color por acción (columna "Acción").
const ACCION_META: Record<string, { verb: string; cls: string }> = {
  registrar_item: { verb: 'Ingresó',      cls: 'text-[#15803D] bg-[rgba(22,163,74,0.12)]' },
  editar_item:    { verb: 'Editó',        cls: 'text-info bg-[rgba(37,99,235,0.10)]' },
  eliminar_item:  { verb: 'Eliminó',      cls: 'text-red bg-[rgba(211,47,47,0.10)]' },
  unificar:       { verb: 'Unificó',      cls: 'text-[#6B21A8] bg-[rgba(107,33,168,0.10)]' },
  sumar:          { verb: 'Sumó',         cls: 'text-[#B45309] bg-[rgba(217,119,6,0.12)]' },
  registrar_dia:  { verb: 'Registró día', cls: 'text-navy bg-[rgba(26,37,80,0.08)]' },
};

function detalleOf(r: ActividadRow) {
  const d = r.detalle ?? {};
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    label: str(d.label), sourceLabel: str(d.sourceLabel), slotId: num(d.slotId), peso: num(d.peso),
    tiendas: num(d.tiendas), pallets: num(d.pallets),
  };
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

      {/* Feed en columnas */}
      <div className="flex-1 overflow-auto min-h-0">
        {loading && rows.length === 0 ? (
          <div className="text-center text-text-3 text-[13px] py-10">Cargando actividad…</div>
        ) : visibles.length === 0 ? (
          <div className="text-center text-text-3 text-[13px] py-10">Sin actividad para estos filtros.</div>
        ) : (
          <table className="w-full text-[13px] border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-bg-2 text-left text-text-3 text-[10px] uppercase tracking-widest">
                <th className="px-3 py-2 font-bold">Hora</th>
                <th className="px-3 py-2 font-bold">Usuario</th>
                <th className="px-3 py-2 font-bold">Acción</th>
                <th className="px-3 py-2 font-bold">Ítem</th>
                <th className="px-3 py-2 font-bold">Código</th>
                <th className="px-3 py-2 font-bold">Peso</th>
                <th className="px-3 py-2 font-bold">Tienda</th>
                <th className="px-3 py-2 font-bold">Fuente</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(r => {
                const meta = ACCION_META[r.accion] ?? { verb: r.accion, cls: 'text-text-3 bg-bg-2' };
                const d = detalleOf(r);
                const item = r.accion === 'registrar_dia'
                  ? [d.tiendas != null ? `${d.tiendas} tiendas` : null, d.pallets != null ? `${d.pallets}P` : null].filter(Boolean).join(' · ') || '—'
                  : (r.accion === 'unificar' || r.accion === 'sumar') && d.sourceLabel
                  ? `${d.sourceLabel} → ${d.label ?? '?'}`
                  : (d.label ?? '—');
                return (
                  <tr key={r.id} className="border-b border-bg-2 bg-white hover:bg-bg/40">
                    <td className="px-3 py-2 font-mono text-text-3 tabular-nums whitespace-nowrap">{hora(r.created_at)}</td>
                    <td className="px-3 py-2 font-bold text-navy whitespace-nowrap">{r.actor_name ?? 'Usuario'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full leading-none ${meta.cls}`}>{meta.verb}</span>
                    </td>
                    <td className="px-3 py-2 font-semibold text-text whitespace-nowrap">{item}</td>
                    <td className="px-3 py-2 font-mono text-navy whitespace-nowrap">{d.slotId ? `#${d.slotId}` : '—'}</td>
                    <td className="px-3 py-2 text-text-2 tabular-nums whitespace-nowrap">{d.peso != null ? `${d.peso}kg` : '—'}</td>
                    <td className="px-3 py-2 text-text-2 whitespace-nowrap">
                      {r.tienda_cod ?? '—'}{r.tienda_nombre ? <span className="text-text-3"> · {r.tienda_nombre}</span> : null}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                        r.fuente === 'nacional' ? 'text-[#6B21A8] bg-[rgba(107,33,168,0.10)]' : 'text-info bg-[rgba(37,99,235,0.10)]'}`}>
                        {FUENTE_LABEL[r.fuente] ?? r.fuente}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
