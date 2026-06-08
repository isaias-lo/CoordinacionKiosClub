'use client';

import { useEffect, useState, useCallback, type RefObject } from 'react';
import { RefreshCw, CheckCheck } from 'lucide-react';
import type { OdooConfig } from '../picking-types';
import { parseOrigin, isAbastecimientoOp, getStoreName } from '../picking-utils';

interface RawPicking {
  id: number; name: string; origin: string; partner: string;
  fromLocation: string; toLocation: string; state: string;
  scheduledDate: string; dateDone: string | null; pickingType: string;
  responsible: string; responsibleId: number | null; lineCount: number;
}
interface Producto { nombre: string; qty: number; }

interface Props {
  odooConfig: OdooConfig;
  hasOdoo: boolean;
  selectedCods: string[];
  onAdd: (picking: RawPicking, cod: string, categories: string[]) => void;
  onNewCountChange?: (n: number) => void;
  seenIdsRef: RefObject<Set<number>>;
}

const CATEGORIAS = ['Comida', 'Aseo', 'Hogar', 'Chocolate'] as const;
const CAT_COLOR: Record<string, string> = {
  Comida: '#D97706', Aseo: '#0891B2', Hogar: '#7C3AED', Chocolate: '#92400E',
};

export function MovimientosOdooPanel({ odooConfig, hasOdoo, selectedCods, onAdd, onNewCountChange, seenIdsRef }: Props) {
  const [movs,      setMovs]      = useState<RawPicking[]>([]);
  const [productos, setProductos] = useState<Record<number, Producto[]>>({});
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [loadedAt,  setLoadedAt]  = useState<Date | null>(null);
  // IDs de pickings "nuevos" en la lista actual (subconjunto de movs que el usuario aún no ha visto).
  // El `seenIdsRef` (vive en PickingScreen) acumula todos los IDs que alguna vez aparecieron.
  const [newIdsByLoad, setNewIdsByLoad] = useState<Set<number>>(new Set());
  // Modal de agregar: movimiento + categorías elegidas
  const [adding,    setAdding]    = useState<{ p: RawPicking; cod: string; cats: Set<string> } | null>(null);

  const load = useCallback(async () => {
    if (!hasOdoo) { setError('Configura Odoo primero (pestaña Config).'); return; }
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/odoo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'picking_today_operations', config: odooConfig }),
      });
      const data = await res.json() as { pickings?: RawPicking[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Error Odoo');
      const list = (data.pickings ?? []).filter(p => !p.origin.toUpperCase().includes('AUDITORIA'));
      setMovs(list);
      setLoadedAt(new Date());

      // Diff contra seenIdsRef: los IDs que no se habían visto antes son "nuevos en esta carga".
      // Independientemente del diff, todos los IDs actuales quedan marcados como vistos.
      const seen  = seenIdsRef.current;
      const fresh = new Set<number>();
      for (const p of list) {
        if (!seen.has(p.id)) fresh.add(p.id);
        seen.add(p.id);
      }
      setNewIdsByLoad(fresh);

      // Traer primeras líneas de producto por movimiento
      const ids = list.map(p => String(p.id));
      if (ids.length) {
        const r2 = await fetch('/api/odoo', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'picking_move_products', config: odooConfig, pickings: ids }),
        });
        const d2 = await r2.json() as { products?: Record<number, Producto[]> };
        setProductos(d2.products ?? {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [hasOdoo, odooConfig, seenIdsRef]);

  useEffect(() => { load(); }, [load]);

  // Reporta al padre el conteo de nuevos para alimentar el badge del tab.
  useEffect(() => {
    onNewCountChange?.(newIdsByLoad.size);
  }, [newIdsByLoad, onNewCountChange]);

  const abrirAgregar = (p: RawPicking) => {
    const { storeCode, categories } = parseOrigin(p.origin);
    setAdding({ p, cod: storeCode, cats: new Set(categories) });
  };

  const confirmarAgregar = () => {
    if (!adding) return;
    if (!adding.cod) { setError('No se detectó la tienda en el documento de origen.'); return; }
    if (adding.cats.size === 0) { setError('Selecciona al menos una categoría.'); return; }
    onAdd(adding.p, adding.cod, [...adding.cats]);
    setAdding(null);
    setError('');
  };

  const handleMarcarVistos = () => {
    setNewIdsByLoad(new Set());
    onNewCountChange?.(0);
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b flex items-center justify-between gap-2" style={{ borderColor: '#E2E8F0' }}>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold" style={{ color: '#1E293B' }}>Movimientos del día (Odoo)</div>
          <div className="text-[12px] mt-0.5 truncate" style={{ color: '#94A3B8' }}>
            {movs.length} movimiento{movs.length !== 1 ? 's' : ''}
            {newIdsByLoad.size > 0 && (
              <span className="ml-1.5 font-bold" style={{ color: '#CA8A04' }}>
                · {newIdsByLoad.size} nuevo{newIdsByLoad.size !== 1 ? 's' : ''}
              </span>
            )}
            {loadedAt ? ` · ${loadedAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {newIdsByLoad.size > 0 && (
            <button onClick={handleMarcarVistos}
              className="flex items-center gap-1.5 text-[12px] font-medium border rounded px-2.5 py-1.5 cursor-pointer"
              style={{ borderColor: '#EAB308', color: '#92400E', background: 'rgba(234,179,8,0.10)' }}>
              <CheckCheck size={12} />
              Marcar vistos
            </button>
          )}
          <button onClick={() => void load()} disabled={loading}
            className="flex items-center gap-1.5 text-[13px] font-medium border rounded px-3 py-1.5 cursor-pointer disabled:opacity-40"
            style={{ borderColor: '#E2E8F0', color: '#64748B', background: '#fff' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="flex-shrink-0 px-4 py-2 text-[12px] text-red-600 bg-red-50 border-b border-red-200">⚠️ {error}</div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
        {loading && movs.length === 0 && <div className="text-center py-10 text-[13px] text-slate-400">Cargando movimientos…</div>}
        {!loading && movs.length === 0 && !error && (
          <div className="text-center py-10 text-[13px] text-slate-400">Sin movimientos hoy</div>
        )}

        {movs.map(p => {
          const { storeCode, categories } = parseOrigin(p.origin);
          const isNew     = newIdsByLoad.has(p.id);
          const yaEnPanel = !!storeCode && selectedCods.includes(storeCode);
          const prods     = (productos[p.id] ?? []).slice(0, 5);
          const sinCat    = !isAbastecimientoOp(p.origin);
          return (
            <div key={p.id}
              className="rounded-lg border p-3"
              style={{
                borderColor: isNew ? '#EAB308' :
                             sinCat ? 'rgba(217,119,6,0.45)' : '#E2E8F0',
                background:  isNew ? 'rgba(234,179,8,0.10)' :
                             sinCat ? 'rgba(217,119,6,0.05)' : '#fff',
                boxShadow:   isNew ? '0 0 0 2px rgba(234,179,8,0.25)' : 'none',
                transition:  'box-shadow 200ms, background 200ms, border-color 200ms',
              }}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[14px] font-extrabold" style={{ color: '#1E293B' }}>{storeCode || '??'}</span>
                    <span className="text-[12px] text-slate-500 truncate">{storeCode ? getStoreName(storeCode) : ''}</span>
                    {isNew && (
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider"
                        style={{ background: '#EAB308', color: '#1E293B' }}>NUEVO</span>
                    )}
                    {sinCat
                      ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(217,119,6,0.18)', color: '#92400E' }}>SIN CATEGORÍA</span>
                      : categories.map(c => (
                          <span key={c} className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${CAT_COLOR[c] ?? '#64748B'}22`, color: CAT_COLOR[c] ?? '#64748B' }}>{c}</span>
                        ))}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 truncate font-mono">{p.origin}</div>
                </div>
                {yaEnPanel ? (
                  <span className="flex-shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(22,163,74,0.12)', color: '#16A34A' }}>✓ En panel</span>
                ) : (
                  <button onClick={() => abrirAgregar(p)}
                    className="flex-shrink-0 text-[12px] font-bold px-3 py-1.5 rounded-lg text-white cursor-pointer transition-all active:scale-95"
                    style={{ background: 'linear-gradient(145deg,#2563EB,#1D4ED8)', boxShadow: '0 2px 8px rgba(37,99,235,0.30)' }}>
                    + Agregar
                  </button>
                )}
              </div>

              {/* Primeras 5 líneas de producto */}
              {prods.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-dashed" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                    Productos (primeros {prods.length}{(productos[p.id]?.length ?? 0) > 5 ? ` de ${productos[p.id]!.length}` : ''})
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {prods.map((pr, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-600 truncate">{pr.nombre}</span>
                        <span className="font-mono text-slate-400 flex-shrink-0 ml-2">{pr.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal Agregar */}
      {adding && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setAdding(null)}>
          <div className="bg-white rounded-2xl overflow-hidden shadow-2xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 bg-navy">
              <div className="font-barlow-condensed text-[16px] font-bold text-white uppercase tracking-wider">
                Agregar movimiento
              </div>
              <div className="text-[12px] text-white/60 mt-0.5">
                {adding.cod || '??'} · {adding.cod ? getStoreName(adding.cod) : 'tienda no detectada'}
              </div>
            </div>
            <div className="p-4">
              <div className="text-[12px] text-slate-500 mb-2">
                ¿Agregar este movimiento al Monitoreo? Selecciona a qué categoría pertenece:
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {CATEGORIAS.map(cat => {
                  const on = adding.cats.has(cat);
                  return (
                    <button key={cat}
                      onClick={() => setAdding(a => {
                        if (!a) return a;
                        const next = new Set(a.cats);
                        next.has(cat) ? next.delete(cat) : next.add(cat);
                        return { ...a, cats: next };
                      })}
                      className="py-2.5 rounded-lg text-[13px] font-bold border-2 transition-all"
                      style={{
                        borderColor: on ? (CAT_COLOR[cat] ?? '#64748B') : '#E2E8F0',
                        background:  on ? `${CAT_COLOR[cat] ?? '#64748B'}14` : '#fff',
                        color:       on ? (CAT_COLOR[cat] ?? '#64748B') : '#94A3B8',
                      }}>
                      {on ? '✓ ' : ''}{cat}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button onClick={confirmarAgregar}
                  className="flex-1 py-2.5 rounded-xl text-[14px] font-bold text-white cursor-pointer"
                  style={{ background: 'linear-gradient(145deg,#16A34A,#15803D)' }}>
                  ✓ Confirmar y agregar
                </button>
                <button onClick={() => setAdding(null)}
                  className="px-4 py-2.5 rounded-xl text-[14px] font-bold cursor-pointer bg-bg-2 text-text-2 border border-border">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
