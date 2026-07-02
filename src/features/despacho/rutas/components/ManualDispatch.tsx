'use client';
import { useState, useEffect, useRef } from 'react';
import { nn } from '../utils/routing';
import { dkm, formatCod } from '../utils/helpers';
import type { Vehiculo } from '../data/flota';
import type { TiendaInfo } from '../data/tiendas';
import type { Parada } from './ParadasAdicionales';

interface StoreTag { c: string; p: number; b: number; }

interface Props {
  calT: Record<string, { on: boolean; p: number; b: number; c: number; ch: number; g?: string }>;
  flota: Vehiculo[];
  gps: Record<string, number[]>;
  tiendas: Record<string, TiendaInfo>;
  cd: number[];
  paradas?: Parada[];
  asignaciones: Record<string, StoreTag[]>;
  onAsignaciones: (a: Record<string, StoreTag[]>) => void;
  onCalcular: () => void;
  onEliminarParada?: (id: string) => void;
  /** [2ª VUELTA] Si se provee, cada camión con tiendas muestra "Cerrar camión" (registro por
   *  camión) y se OCULTA el botón batch de calcular. */
  onCerrarCamion?: (patente: string) => void;
}

function estimarKm(stores: StoreTag[], gps: Record<string, number[]>, cd: number[]): number {
  if (!stores.length) return 0;
  const enriched = stores.map(s => ({ ...s, _v: '' }));
  const ordered  = nn(enriched, gps, cd);
  let km = 0, prev = cd;
  ordered.forEach(t => { const g = gps[t.c]; if (g) { km += dkm(prev, g); prev = g; } });
  if (ordered.length && gps[ordered[ordered.length - 1].c]) km += dkm(prev, cd);
  return Math.round(km);
}

interface DraggingState extends StoreTag { from: string; }

export default function ManualDispatch({
  calT, flota, gps, tiendas, cd,
  paradas = [],
  asignaciones, onAsignaciones,
  onCalcular,
  onEliminarParada,
  onCerrarCamion,
}: Props) {
  const [dragging,          setDragging]          = useState<DraggingState | null>(null);
  const [dragOver,          setDragOver]          = useState<string | null>(null);
  const [selected,          setSelected]          = useState<Set<string>>(new Set()); // P10b: multi-selección del pool
  const scrollRaf    = useRef<number | null>(null);
  const touchState   = useRef<{ active: boolean; item: StoreTag | null; from: string | null; ghost: HTMLElement | null }>({ active: false, item: null, from: null, ghost: null });
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollerRef  = useRef<HTMLElement | null>(null);
  const ejecutarDropRef = useRef<((target: string, item: DraggingState) => void) | null>(null);

  // Find nearest scrollable ancestor (may not be window when inside fixed layouts)
  useEffect(() => {
    let el = containerRef.current?.parentElement ?? null;
    while (el) {
      const { overflowY } = window.getComputedStyle(el);
      if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
        scrollerRef.current = el;
        break;
      }
      el = el.parentElement;
    }
  }, []);

  const tiendasActivas = Object.keys(calT)
    .filter(c => calT[c].on && (calT[c].p > 0 || calT[c].b > 0 || (calT[c].ch ?? 0) > 0))
    .map(c => ({ c, p: calT[c].p, b: calT[c].b, ch: calT[c].ch ?? 0 }));

  const paradasConGps = paradas.filter(p => p.gps);

  const asignadasSet = new Set(Object.values(asignaciones).flat().map(s => s.c));
  const pool         = tiendasActivas.filter(t => !asignadasSet.has(t.c));
  const paradasPool  = paradasConGps.filter(p => !asignadasSet.has(p.id));

  const extGps: Record<string, number[]> = { ...gps };
  paradasConGps.forEach(p => { extGps[p.id] = p.gps; });

  const flotaDisp = flota.filter(v => v.on);

  // P10b: mover todas las tiendas seleccionadas a una patente (o de vuelta al pool) de una vez
  function toggleSelect(code: string) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(code)) n.delete(code); else n.add(code);
      return n;
    });
  }
  function clearSel() { setSelected(new Set()); }

  function moveSelectedTo(target: string) {
    const codes = [...selected];
    if (codes.length === 0) return;
    const newAsig: Record<string, StoreTag[]> = {};
    Object.keys(asignaciones).forEach(plate => {
      newAsig[plate] = (asignaciones[plate] || []).filter(s => !codes.includes(s.c));
    });
    const findTag = (code: string): StoreTag | null => {
      const inPool = pool.find(t => t.c === code);
      if (inPool) return inPool;
      const inParada = paradasPool.find(p => p.id === code);
      if (inParada) return { c: inParada.id, p: inParada.p, b: inParada.b };
      for (const plate of Object.keys(asignaciones)) {
        const f = (asignaciones[plate] || []).find(s => s.c === code);
        if (f) return f;
      }
      return null;
    };
    const tags = codes.map(findTag).filter((t): t is StoreTag => !!t);
    if (target !== 'pool') {
      const vehicle = flota.find(v => v.p === target);
      const cap     = vehicle?.c || 10;
      const current = newAsig[target] || [];
      const usedP   = current.reduce((s, t) => s + t.p, 0);
      const addP    = tags.reduce((s, t) => s + t.p, 0);
      if (usedP + addP > cap) {
        alert(`⚠️ ${vehicle?.p} admite máximo ${cap} pallets. Ya tiene ${usedP}p y quieres sumar ${addP}p. Deselecciona algunas.`);
        return;
      }
      const existing = new Set(current.map(s => s.c));
      newAsig[target] = [...current, ...tags.filter(t => !existing.has(t.c))];
    }
    onAsignaciones(newAsig);
    clearSel();
    setDragging(null);
    setDragOver(null);
  }

  function ejecutarDrop(target: string, item: DraggingState) {
    // Si arrastras una tienda que está en la selección múltiple, mueve todo el grupo
    if (selected.size > 0 && selected.has(item.c)) { moveSelectedTo(target); return; }
    const { from, ...store } = item;
    const newAsig = { ...asignaciones };
    if (from !== 'pool') {
      newAsig[from] = (newAsig[from] || []).filter(s => s.c !== store.c);
    }
    if (target !== 'pool') {
      const currentP = (newAsig[target] || []).filter(s => s.c !== store.c);
      const vehicle  = flota.find(v => v.p === target);
      const cap      = vehicle?.c || 10;
      const usedP    = currentP.reduce((s, t) => s + t.p, 0);
      if (usedP + store.p > cap) {
        alert(`⚠️ ${vehicle?.p} admite máximo ${cap} pallets. Ya tiene ${usedP}p. Intenta con ${cap - usedP}p o menos.`);
        return;
      }
      newAsig[target] = [...currentP, store];
    } else {
      if (from !== 'pool') newAsig[from] = (newAsig[from] || []).filter(s => s.c !== store.c);
    }
    onAsignaciones(newAsig);
    setDragging(null);
    setDragOver(null);
  }

  ejecutarDropRef.current = ejecutarDrop;

  function handleDragStart(e: React.DragEvent, store: StoreTag, from: string) {
    setDragging({ ...store, from });
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDrop(e: React.DragEvent, target: string) {
    e.preventDefault();
    if (!dragging) return;
    ejecutarDrop(target, dragging);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
  }

  function handleDragEnd() { setDragging(null); setDragOver(null); }

  function handleTouchStart(e: React.TouchEvent, store: StoreTag, from: string) {
    const touch = e.touches[0];
    const el    = e.currentTarget as HTMLElement;
    const rect  = el.getBoundingClientRect();
    const w     = Math.min(rect.width, 150);

    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.style.cssText = [
      'position:fixed',
      `left:${touch.clientX - w / 2}px`,
      `top:${touch.clientY - rect.height / 2}px`,
      `width:${w}px`,
      'pointer-events:none',
      'opacity:0.88',
      'z-index:9999',
      'border-radius:6px',
      'transform:scale(1.08)',
      'box-shadow:0 8px 28px rgba(0,0,0,0.22)',
      'transition:none',
    ].join(';');
    document.body.appendChild(ghost);

    touchState.current = { active: true, item: store, from, ghost };
    setDragging({ ...store, from });
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onTouchMove(e: TouchEvent) {
      if (!touchState.current.active) return;
      e.preventDefault();
      const touch = e.touches[0];
      const { ghost } = touchState.current;

      if (ghost) {
        const w = parseFloat(ghost.style.width) || 120;
        ghost.style.left = `${touch.clientX - w / 2}px`;
        ghost.style.top  = `${touch.clientY - 18}px`;
        ghost.style.pointerEvents = 'none';
      }

      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      if (ghost) ghost.style.pointerEvents = '';
      const zone = el?.closest('[data-dropzone]') as HTMLElement | null;
      setDragOver(zone ? zone.dataset.dropzone! : null);

      const ZONE = 80, SPEED = 7;
      const scroller = scrollerRef.current ?? window;
      if (touch.clientY < ZONE) scroller.scrollBy(0, -SPEED);
      else if (touch.clientY > window.innerHeight - ZONE) scroller.scrollBy(0, SPEED);
    }

    function onTouchEnd(e: TouchEvent) {
      if (!touchState.current.active) return;
      const touch = e.changedTouches[0];
      const { ghost, item, from } = touchState.current;

      if (ghost) {
        ghost.style.pointerEvents = 'none';
        const el   = document.elementFromPoint(touch.clientX, touch.clientY);
        const zone = el?.closest('[data-dropzone]') as HTMLElement | null;
        if (zone && item && from) {
          ejecutarDropRef.current?.(zone.dataset.dropzone!, { ...item, from });
        }
        ghost.remove();
      }

      touchState.current = { active: false, item: null, from: null, ghost: null };
      setDragging(null);
      setDragOver(null);
    }

    container.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    return () => {
      container.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  useEffect(() => {
    function onDragOver(e: DragEvent) {
      const ZONE = 80, SPEED = 8;
      cancelAnimationFrame(scrollRaf.current!);
      const scroller = scrollerRef.current ?? window;
      if (e.clientY < ZONE) {
        scrollRaf.current = requestAnimationFrame(function scroll() {
          scroller.scrollBy(0, -SPEED);
          scrollRaf.current = requestAnimationFrame(scroll);
        });
      } else if (e.clientY > window.innerHeight - ZONE) {
        scrollRaf.current = requestAnimationFrame(function scroll() {
          scroller.scrollBy(0, SPEED);
          scrollRaf.current = requestAnimationFrame(scroll);
        });
      }
    }
    function stopScroll() { cancelAnimationFrame(scrollRaf.current!); }
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragend', stopScroll);
    document.addEventListener('drop', stopScroll);
    return () => {
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragend', stopScroll);
      document.removeEventListener('drop', stopScroll);
      cancelAnimationFrame(scrollRaf.current!);
    };
  }, []);

  function removeStore(plate: string, cod: string) {
    onAsignaciones({ ...asignaciones, [plate]: (asignaciones[plate] || []).filter(s => s.c !== cod) });
  }

  function getMetrics(plate: string, vehicle: Vehiculo) {
    const stores = asignaciones[plate] || [];
    const tp  = stores.reduce((s, t) => s + t.p, 0);
    const tb  = stores.reduce((s, t) => s + t.b + ((t as { ch?: number }).ch ?? 0), 0);
    const cap = vehicle?.c || 10;
    const pct = cap > 0 ? tp / cap : 0;
    const kmEst = estimarKm(stores, extGps, cd);
    return { tp, tb, cap, pct, kmEst, overCap: tp > cap };
  }

  const pendientesTotal = pool.length + paradasPool.length;
  const issues: string[] = [];
  if (pendientesTotal > 0) issues.push(`${pendientesTotal} parada${pendientesTotal > 1 ? 's' : ''} sin asignar`);
  flotaDisp.forEach(v => {
    const m = getMetrics(v.p, v);
    if (m.overCap) issues.push(`${v.p} excede capacidad (${m.tp}/${m.cap}p)`);
  });

  const totalEstKm    = flotaDisp.reduce((s, v) => s + getMetrics(v.p, v).kmEst, 0);
  const tiendasCount  = tiendasActivas.length + paradasConGps.length;
  const isSelected    = dragging !== null;
  const hasSelection  = selected.size > 0;

  return (
    <div className="space-y-3" ref={containerRef}>
      {tiendasCount > 0 && (
        <div className="flex gap-2 text-[11px] text-kmuted bg-kbg rounded-kios2 px-3 py-2">
          <span><span className="font-semibold text-ktext">{tiendasCount}</span> tiendas ·</span>
          <span><span className="font-semibold text-ktext">{tiendasCount - pool.length}</span> asignadas</span>
          {totalEstKm > 0 && <><span>·</span><span><span className="font-semibold text-ktext">~{totalEstKm} km</span> total</span></>}
        </div>
      )}

      {tiendasCount === 0 && (
        <div className="bg-kbg border border-black/[0.09] rounded-kios2 px-3 py-3 text-[13px] text-kmuted text-center">
          Activa tiendas arriba e ingresa sus pallets para comenzar.
        </div>
      )}

      {tiendasCount > 0 && (
        <div
          data-dropzone="pool"
          style={{
            boxShadow: dragOver === 'pool'
              ? '0 0 0 2px rgba(212,43,43,0.25), 0 2px 12px rgba(212,43,43,0.10)'
              : '0 1px 3px rgba(0,0,0,0.06)',
          }}
          className={`rounded-[14px] border-[1.5px] transition-all mb-4 ${dragOver === 'pool' ? 'border-kred bg-kred/[0.03]' : 'border-black/[0.09] bg-white'}`}
          onDragOver={e => { e.preventDefault(); setDragOver('pool'); }}
          onDrop={e => { e.preventDefault(); if (dragging) ejecutarDrop('pool', dragging); }}
          onDragLeave={handleDragLeave}
          onClick={() => { if (dragging) ejecutarDrop('pool', dragging); }}
        >
          <div className="px-4 py-3 border-b border-black/[0.07] flex items-center gap-3">
            <div className="flex-1">
              <span className="text-[14px] font-bold text-ktext">📦 Sin asignar</span>
              {dragging && <span className="ml-2 text-[12px] text-kred font-semibold animate-pulse">← Suelta aquí</span>}
            </div>
            <span className={`text-[13px] font-bold ${pool.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {pool.length > 0 ? `${pool.length} restantes` : '✓ Todas asignadas'}
            </span>
          </div>
          {hasSelection && (
            <div className="px-4 py-2 bg-kred/[0.05] border-b border-kred/15 flex items-center gap-2 text-[12px]">
              <span className="font-bold text-kred">{selected.size} seleccionada{selected.size > 1 ? 's' : ''}</span>
              <span className="text-kmuted">— toca una patente para mover todas a la vez</span>
              <button onClick={e => { e.stopPropagation(); clearSel(); }} className="ml-auto text-kmuted underline font-semibold">Limpiar</button>
            </div>
          )}
          <div className="p-3 flex flex-wrap gap-[6px] min-h-[64px] items-start">
            {pool.length === 0 && paradasPool.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600">
                <span className="text-[18px]">✓</span>
                <span className="text-[13px] font-semibold">Todo asignado</span>
              </div>
            ) : (
              <>
                {pool.map(t => (
                  <StoreTagComp
                    key={t.c} store={t} tiendas={tiendas}
                    isDragging={dragging?.c === t.c}
                    selected={selected.has(t.c)}
                    onToggleSelect={() => toggleSelect(t.c)}
                    onDragStart={e => handleDragStart(e, t, 'pool')}
                    onDragEnd={handleDragEnd}
                    onTouchStart={e => handleTouchStart(e, t, 'pool')}
                    onRemove={null}
                  />
                ))}
                {paradasPool.map(p => (
                  <ParadaTagComp
                    key={p.id} parada={p}
                    isDragging={dragging?.c === p.id}
                    selected={selected.has(p.id)}
                    onToggleSelect={() => toggleSelect(p.id)}
                    onDragStart={e => handleDragStart(e, { c: p.id, p: p.p, b: p.b }, 'pool')}
                    onDragEnd={handleDragEnd}
                    onTouchStart={e => handleTouchStart(e, { c: p.id, p: p.p, b: p.b }, 'pool')}
                    onRemove={onEliminarParada ? () => onEliminarParada(p.id) : null}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {flotaDisp.length === 0 ? (
        <div className="text-[13px] text-kmuted text-center py-4 bg-white rounded-kios border border-black/[0.09]">
          No hay vehículos activos.
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {flotaDisp.map((v) => {
          const m       = getMetrics(v.p, v);
          const stores  = asignaciones[v.p] || [];
          const isOver  = dragOver === v.p;
          const pctColor = m.overCap ? 'bg-red-400' : m.pct > 0.85 ? 'bg-amber-400' : 'bg-kred';

          return (
            <div
              key={v.p}
              data-dropzone={v.p}
              style={{
                boxShadow: isOver
                  ? '0 0 0 2px rgba(212,43,43,0.25), 0 4px 20px rgba(212,43,43,0.12)'
                  : m.overCap
                    ? '0 2px 10px rgba(245,158,11,0.18)'
                    : '0 1px 4px rgba(0,0,0,0.06), 0 2px 12px rgba(0,0,0,0.04)',
              }}
              className={`rounded-[14px] border-[1.5px] transition-all bg-white flex flex-col ${isOver ? 'border-kred' : m.overCap ? 'border-amber-400' : 'border-black/[0.08]'}`}
              onDragOver={e => { e.preventDefault(); setDragOver(v.p); }}
              onDrop={e => handleDrop(e, v.p)}
              onDragLeave={handleDragLeave}
              onClick={() => {
                if (hasSelection) moveSelectedTo(v.p);
                else if (isSelected && dragging) ejecutarDrop(v.p, dragging);
              }}
            >
              {/* ── Cabecera: patente + badges (el conductor se asigna en FLOTA → Gestionar) ── */}
              <div className="px-2.5 pt-2 pb-1.5 border-b border-black/[0.06]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-[17px] text-ktext leading-none tracking-tight">{v.p}</span>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {v.tlbd      && <span className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-[2px] rounded-full font-bold">2ª v.</span>}
                    {v.porton    && <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-[2px] rounded-full font-semibold">Portón</span>}
                    {v.refrigerado && <span className="text-[9px] bg-cyan-50 text-cyan-600 px-1.5 py-[2px] rounded-full font-semibold">❄ Frío</span>}
                  </div>
                </div>
                {v.t && <div className="text-[10px] text-kmuted/60 mt-0.5 truncate">{v.t}</div>}
              </div>

              {/* ── Métricas: carga + km (compacto) ── */}
              <div className="px-2.5 py-1.5 border-b border-black/[0.06] space-y-1">
                {/* Capacidad */}
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-[16px] font-bold leading-none ${m.overCap ? 'text-red-500' : 'text-ktext'}`}>{m.tp}</span>
                      <span className="text-[11px] text-kmuted font-semibold">/ {v.c} p</span>
                      {m.tb > 0 && <span className="text-[10px] text-kmuted">· {m.tb}b</span>}
                    </div>
                    <span className={`text-[12px] font-bold ${m.overCap ? 'text-red-500' : m.pct > 0.85 ? 'text-amber-500' : 'text-green-600'}`}>
                      {Math.round(m.pct * 100)}%{m.overCap && ' ⚠'}
                    </span>
                  </div>
                  <div className="h-[5px] bg-kbg rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${pctColor}`} style={{ width: `${Math.min(m.pct * 100, 100)}%` }} />
                  </div>
                </div>
                {/* KM estimado */}
                <div className="flex items-center gap-2">
                  {m.kmEst > 0 ? (
                    <span className="text-[11px] text-kmuted"><span className="font-bold text-ktext">~{m.kmEst} km</span> · {stores.length} parada{stores.length !== 1 ? 's' : ''}</span>
                  ) : (
                    <span className="text-[10px] text-kmuted/40 italic">Sin tiendas aún</span>
                  )}
                </div>
              </div>

              {/* ── Tiendas asignadas ── */}
              <div className="px-2.5 pb-2 pt-1.5 flex flex-wrap gap-[5px] min-h-[42px] flex-1">
                {stores.length === 0 ? (
                  <div className={`w-full flex items-center justify-center rounded-[10px] border-[1.5px] border-dashed transition-colors min-h-[34px] ${isOver ? 'border-kred/50 bg-kred/[0.04]' : 'border-black/[0.12]'}`}>
                    <span className={`text-[12px] font-semibold transition-colors ${isOver ? 'text-kred' : 'text-kmuted/50'}`}>
                      {isOver || isSelected ? '↓ Suelta aquí' : hasSelection ? '↓ Toca para mover selección' : 'Arrastra tiendas aquí'}
                    </span>
                  </div>
                ) : (
                  stores.map(t => {
                    const parada = paradas.find(p => p.id === t.c);
                    return parada ? (
                      <ParadaTagComp
                        key={t.c} parada={parada}
                        isDragging={dragging?.c === t.c}
                        onDragStart={e => handleDragStart(e, t, v.p)}
                        onDragEnd={handleDragEnd}
                        onTouchStart={e => handleTouchStart(e, t, v.p)}
                        onRemove={() => removeStore(v.p, t.c)}
                      />
                    ) : (
                      <StoreTagComp
                        key={t.c} store={t} tiendas={tiendas}
                        isDragging={dragging?.c === t.c}
                        onDragStart={e => handleDragStart(e, t, v.p)}
                        onDragEnd={handleDragEnd}
                        onTouchStart={e => handleTouchStart(e, t, v.p)}
                        onRemove={() => removeStore(v.p, t.c)}
                      />
                    );
                  })
                )}
              </div>

              {/* [2ª VUELTA] Cerrar camión y generar su manifiesto (registro por camión) */}
              {onCerrarCamion && stores.length > 0 && (
                <div className="px-2.5 pb-2.5 pt-0.5">
                  <button
                    onClick={e => { e.stopPropagation(); onCerrarCamion(v.p); }}
                    disabled={m.overCap}
                    className="w-full h-[38px] rounded-[10px] bg-knavy text-white text-[12px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-40"
                  >
                    🚚 Cerrar camión y manifiesto
                  </button>
                </div>
              )}
            </div>
          );
        })}
        </div>
      )}

      {issues.length > 0 && (
        <div
          style={{ boxShadow: '0 1px 4px rgba(245,158,11,0.15)' }}
          className="bg-amber-50 border border-amber-200 rounded-[12px] px-4 py-3 text-[13px] text-amber-800 leading-relaxed"
        >
          ⚠️ {issues.join(' · ')}
        </div>
      )}

      {tiendasCount > 0 && !onCerrarCamion && (
        <button
          onClick={() => {
            if (pendientesTotal > 0) {
              const ok = confirm(
                `Quedan ${pendientesTotal} parada${pendientesTotal > 1 ? 's' : ''} sin asignar.\n\n` +
                `¿Calcular ruta parcial con lo asignado hasta ahora?\n\n` +
                `Las paradas sin asignar quedarán guardadas para el día siguiente.`
              );
              if (!ok) return;
              // Guardar tiendas pendientes para el día siguiente
              try {
                localStorage.setItem('despacho_pendientes', JSON.stringify({
                  savedAt: new Date().toISOString().split('T')[0],
                  stores: pool.map(t => ({ c: t.c, p: t.p, b: t.b, ch: (t as { ch?: number }).ch ?? 0 })),
                }));
              } catch {}
            } else {
              // Todo asignado: limpiar pendientes anteriores si los hubiera
              try { localStorage.removeItem('despacho_pendientes'); } catch {}
            }
            onCalcular();
          }}
          disabled={issues.some(i => i.includes('excede'))}
          style={!issues.some(i => i.includes('excede')) ? {
            boxShadow: pendientesTotal > 0
              ? '0 4px 16px rgba(245,158,11,0.35)'
              : '0 4px 16px rgba(212,43,43,0.32)',
          } : undefined}
          className={`w-full h-[56px] rounded-[14px] text-[16px] font-bold transition-all flex items-center justify-center gap-2 mt-1
            ${issues.some(i => i.includes('excede'))
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
              : pendientesTotal > 0
                ? 'bg-amber-500 text-white active:scale-[0.98]'
                : 'bg-kred text-white active:scale-[0.98]'}`}
        >
          {pendientesTotal > 0
            ? `⚠️ Calcular ruta parcial (${pendientesTotal} sin asignar)`
            : '🔍 Calcular y Comparar Rutas'}
        </button>
      )}
    </div>
  );
}

function ParadaTagComp({ parada, isDragging, selected, onToggleSelect, onDragStart, onDragEnd, onTouchStart, onRemove }: {
  parada: Parada; isDragging: boolean;
  selected?: boolean; onToggleSelect?: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onRemove: (() => void) | null;
}) {
  const isEntrega = parada.tipo === 'entrega';
  const short = parada.direccion.split(',')[0].substring(0, 20);
  return (
    <div
      draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onTouchStart={onTouchStart}
      className={`flex items-center gap-1 rounded-[6px] px-2 py-[5px] cursor-grab select-none transition-all border min-h-[36px] touch-manipulation ${isDragging
        ? 'opacity-30 scale-95'
        : selected
          ? `ring-2 ring-kred/40 ${isEntrega ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-orange-100 border-orange-400 text-orange-800'}`
          : isEntrega
            ? 'bg-blue-50 border-blue-200 text-blue-700 active:bg-blue-100'
            : 'bg-orange-50 border-orange-200 text-orange-700 active:bg-orange-100'}`}
    >
      {onToggleSelect && (
        <button
          onClick={e => { e.stopPropagation(); onToggleSelect(); }}
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
          draggable={false}
          title="Seleccionar para mover en grupo"
          className={`w-[16px] h-[16px] rounded-full border flex items-center justify-center text-[9px] font-bold leading-none flex-shrink-0 ${selected ? 'bg-kred border-kred text-white' : 'bg-white border-black/25 text-transparent'}`}
        >✓</button>
      )}
      <span className="text-[11px] font-bold">{isEntrega ? '↓' : '↑'}</span>
      <span className="text-[11px] font-semibold truncate max-w-[80px]">{short}</span>
      {(parada.p > 0 || parada.b > 0) && (
        <span className="text-[10px] opacity-60">{parada.p > 0 ? `${parada.p}p` : ''}{parada.b > 0 ? `${parada.b}b` : ''}</span>
      )}
      {onRemove && (
        <button onClick={e => { e.stopPropagation(); onRemove(); }} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}
          className="text-[11px] opacity-40 hover:opacity-80 font-bold leading-none ml-0.5 w-[14px] h-[14px] flex items-center justify-center">×</button>
      )}
    </div>
  );
}

function StoreTagComp({ store, tiendas, isDragging, selected, onToggleSelect, onDragStart, onDragEnd, onTouchStart, onRemove }: {
  store: StoreTag; tiendas: Record<string, TiendaInfo>; isDragging: boolean;
  selected?: boolean; onToggleSelect?: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onRemove: (() => void) | null;
}) {
  const info = tiendas[store.c];
  return (
    <div
      draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onTouchStart={onTouchStart}
      style={!isDragging ? { boxShadow: '0 1px 3px rgba(212,43,43,0.15)' } : undefined}
      className={`flex items-center gap-1.5 rounded-[8px] px-2.5 py-[6px] cursor-grab select-none transition-all border min-h-[38px] touch-manipulation ${isDragging
        ? 'opacity-30 scale-95 bg-kred/[0.05] border-kred/20'
        : selected
          ? 'bg-kred/[0.15] border-kred text-kred ring-2 ring-kred/40'
          : 'bg-kred/[0.07] border-kred/[0.25] text-kred active:bg-kred/[0.15]'}`}
      title={info ? `${info.n} · ${store.p}p ${store.b + ((store as { ch?: number }).ch ?? 0)}b` : `${store.c} · ${store.p}p ${store.b + ((store as { ch?: number }).ch ?? 0)}b`}
    >
      {onToggleSelect && (
        <button
          onClick={e => { e.stopPropagation(); onToggleSelect(); }}
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
          draggable={false}
          title="Seleccionar para mover en grupo"
          className={`w-[17px] h-[17px] rounded-full border flex items-center justify-center text-[10px] font-bold leading-none flex-shrink-0 ${selected ? 'bg-kred border-kred text-white' : 'bg-white border-kred/40 text-transparent'}`}
        >✓</button>
      )}
      <span className="font-mono font-bold text-[13px]">{formatCod(store.c)}</span>
      <span className="text-[11px] text-kred/60 font-semibold">{store.p}p</span>
      {(store.b + ((store as { ch?: number }).ch ?? 0)) > 0 && (
        <span className="text-[11px] text-kred/50 font-semibold">{store.b + ((store as { ch?: number }).ch ?? 0)}b</span>
      )}
      {onRemove && (
        <button onClick={e => { e.stopPropagation(); onRemove(); }} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}
          className="text-[13px] text-kred/40 hover:text-kred font-bold leading-none ml-0.5 w-[16px] h-[16px] flex items-center justify-center">×</button>
      )}
    </div>
  );
}
