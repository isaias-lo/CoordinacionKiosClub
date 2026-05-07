'use client';
import { useState, useEffect, useRef } from 'react';
import { nn } from '../utils/routing';
import { dkm, formatCod } from '../utils/helpers';
import type { Vehiculo } from '../data/flota';
import type { TiendaInfo } from '../data/tiendas';
import type { Parada } from './ParadasAdicionales';

interface StoreTag { c: string; p: number; b: number; }

interface Props {
  calT: Record<string, { on: boolean; p: number; b: number; g?: string }>;
  flota: Vehiculo[];
  gps: Record<string, number[]>;
  tiendas: Record<string, TiendaInfo>;
  cd: number[];
  paradas?: Parada[];
  asignaciones: Record<string, StoreTag[]>;
  onAsignaciones: (a: Record<string, StoreTag[]>) => void;
  onCalcular: () => void;
  conductores?: string[];
  onConductorChange: (idx: number, nombre: string) => void;
  onAgregarConductor: (nombre: string) => void;
  onEliminarParada?: (id: string) => void;
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
  conductores = [],
  onConductorChange,
  onAgregarConductor,
  onEliminarParada,
}: Props) {
  const [conductorEditando, setConductorEditando] = useState<string | null>(null);
  const [nuevoConductor,    setNuevoConductor]    = useState('');
  const [dragging,          setDragging]          = useState<DraggingState | null>(null);
  const [dragOver,          setDragOver]          = useState<string | null>(null);
  const scrollRaf    = useRef<number | null>(null);
  const touchState   = useRef<{ active: boolean; item: StoreTag | null; from: string | null; ghost: HTMLElement | null }>({ active: false, item: null, from: null, ghost: null });
  const containerRef = useRef<HTMLDivElement>(null);
  const ejecutarDropRef = useRef<((target: string, item: DraggingState) => void) | null>(null);

  const tiendasActivas = Object.keys(calT)
    .filter(c => calT[c].on && (calT[c].p > 0 || calT[c].b > 0))
    .map(c => ({ c, p: calT[c].p, b: calT[c].b }));

  const paradasConGps = paradas.filter(p => p.gps);

  const asignadasSet = new Set(Object.values(asignaciones).flat().map(s => s.c));
  const pool         = tiendasActivas.filter(t => !asignadasSet.has(t.c));
  const paradasPool  = paradasConGps.filter(p => !asignadasSet.has(p.id));

  const extGps: Record<string, number[]> = { ...gps };
  paradasConGps.forEach(p => { extGps[p.id] = p.gps; });

  const flotaDisp = flota.filter(v => v.on);

  function ejecutarDrop(target: string, item: DraggingState) {
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
      if (touch.clientY < ZONE) window.scrollBy(0, -SPEED);
      else if (touch.clientY > window.innerHeight - ZONE) window.scrollBy(0, SPEED);
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
      if (e.clientY < ZONE) {
        scrollRaf.current = requestAnimationFrame(function scroll() {
          window.scrollBy(0, -SPEED);
          scrollRaf.current = requestAnimationFrame(scroll);
        });
      } else if (e.clientY > window.innerHeight - ZONE) {
        scrollRaf.current = requestAnimationFrame(function scroll() {
          window.scrollBy(0, SPEED);
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
    const tb  = stores.reduce((s, t) => s + t.b, 0);
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
          className={`rounded-kios border-[1.5px] transition-all ${dragOver === 'pool' ? 'border-kred bg-kred/[0.04] shadow-[0_0_0_2px_rgba(212,43,43,0.1)]' : 'border-black/[0.09] bg-kbg'}`}
          onDragOver={e => { e.preventDefault(); setDragOver('pool'); }}
          onDrop={e => { e.preventDefault(); if (dragging) ejecutarDrop('pool', dragging); }}
          onDragLeave={handleDragLeave}
          onClick={() => { if (dragging) ejecutarDrop('pool', dragging); }}
        >
          <div className="px-3 py-2 border-b border-black/[0.06] flex items-center gap-2">
            <span className="text-[12px] font-bold text-ktext">Tiendas sin asignar</span>
            {dragging && <span className="text-[10px] text-kred font-semibold">← Suelta aquí</span>}
            <span className="text-[11px] text-kmuted ml-auto">{pool.length > 0 ? `${pool.length} restantes` : '¡Todas asignadas!'}</span>
          </div>
          <div className="p-3 flex flex-wrap gap-[6px] min-h-[52px]">
            {pool.length === 0 && paradasPool.length === 0 ? (
              <span className="text-[12px] text-green-600 font-semibold">✓ Todo asignado</span>
            ) : (
              <>
                {pool.map(t => (
                  <StoreTagComp
                    key={t.c} store={t} tiendas={tiendas}
                    isDragging={dragging?.c === t.c}                    onDragStart={e => handleDragStart(e, t, 'pool')}
                    onDragEnd={handleDragEnd}
                    onTouchStart={e => handleTouchStart(e, t, 'pool')}
                    onRemove={null}
                  />
                ))}
                {paradasPool.map(p => (
                  <ParadaTagComp
                    key={p.id} parada={p}
                    isDragging={dragging?.c === p.id}                    onDragStart={e => handleDragStart(e, { c: p.id, p: p.p, b: p.b }, 'pool')}
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
        flotaDisp.map((v) => {
          const realIdx = flota.findIndex(fv => fv.p === v.p);
          const m       = getMetrics(v.p, v);
          const stores  = asignaciones[v.p] || [];
          const isOver  = dragOver === v.p;
          const pctColor = m.overCap ? 'bg-red-400' : m.pct > 0.85 ? 'bg-amber-400' : 'bg-kred';

          return (
            <div
              key={v.p}
              data-dropzone={v.p}
              className={`rounded-kios border-[1.5px] transition-all bg-white ${isOver ? 'border-kred shadow-[0_0_0_3px_rgba(212,43,43,0.15)]' : m.overCap ? 'border-amber-400' : 'border-black/[0.09]'}`}
              onDragOver={e => { e.preventDefault(); setDragOver(v.p); }}
              onDrop={e => handleDrop(e, v.p)}
              onDragLeave={handleDragLeave}
              onClick={() => { if (isSelected && dragging) ejecutarDrop(v.p, dragging); }}
            >
              <div className="px-3 py-2.5 border-b border-black/[0.06] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-bold text-[15px] text-ktext">{v.p}</span>
                  {v.tlbd      && <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full font-bold">2a vuelta</span>}
                  {v.porton    && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold">Portón</span>}
                  {v.refrigerado && <span className="text-[10px] bg-cyan-50 text-cyan-600 px-1.5 py-0.5 rounded-full font-semibold">Frío</span>}
                </div>
                <div className="text-right shrink-0">
                  {conductorEditando === v.p ? (
                    <div className="flex flex-col items-end gap-1">
                      <div className="relative">
                        <select
                          autoFocus value={v.ch || ''}
                          onChange={e => {
                            if (e.target.value === '___nuevo___') { setNuevoConductor('__mostrar_input__'); }
                            else { onConductorChange(realIdx, e.target.value); setConductorEditando(null); }
                          }}
                          onBlur={() => { if (nuevoConductor !== '__mostrar_input__') setConductorEditando(null); }}
                          className="text-[12px] font-semibold text-kred bg-white border border-kred rounded px-2 py-1 min-w-[130px] appearance-none cursor-pointer"
                        >
                          <option value="">Sin conductor</option>
                          {conductores.map(c => <option key={c} value={c}>{c}</option>)}
                          <option value="___nuevo___">+ Agregar nuevo</option>
                        </select>
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-kred pointer-events-none">▼</span>
                      </div>
                      {nuevoConductor === '__mostrar_input__' && (
                        <input
                          type="text" placeholder="Nombre del conductor" autoFocus
                          onChange={e => setNuevoConductor(e.target.value)}
                          onKeyDown={e => {
                            const target = e.target as HTMLInputElement;
                            if (e.key === 'Enter' && target.value.trim()) {
                              onAgregarConductor(target.value.trim());
                              onConductorChange(realIdx, target.value.trim());
                              setConductorEditando(null);
                              setNuevoConductor('');
                            }
                          }}
                          onBlur={e => {
                            if (nuevoConductor !== '__mostrar_input__' && e.target.value.trim()) {
                              onAgregarConductor(e.target.value.trim());
                              onConductorChange(realIdx, e.target.value.trim());
                            }
                            setConductorEditando(null);
                            setNuevoConductor('');
                          }}
                          className="text-[12px] border border-kred rounded px-2 py-1 w-[130px] mt-1"
                        />
                      )}
                    </div>
                  ) : (
                    <div onClick={() => setConductorEditando(v.p)} className="text-[12px] font-semibold text-kmuted hover:text-kred cursor-pointer">
                      {v.ch || 'Sin conductor'}
                    </div>
                  )}
                  <div className="text-[11px] text-kmuted/70">{v.t}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 divide-x divide-black/[0.06] border-b border-black/[0.06]">
                <div className="px-3 py-2.5">
                  <div className="text-[10px] font-bold text-kmuted uppercase tracking-[0.5px] mb-1.5">Capacidad de carga</div>
                  <div className="flex items-end gap-1 mb-1.5">
                    <span className={`text-[22px] font-bold leading-none ${m.overCap ? 'text-red-500' : 'text-ktext'}`}>{m.tp}</span>
                    <span className="text-[13px] text-kmuted mb-0.5">/ {v.c} pallets</span>
                  </div>
                  <div className="h-[7px] bg-kbg rounded-full overflow-hidden mb-1">
                    <div className={`h-full rounded-full transition-all duration-300 ${pctColor}`} style={{ width: `${Math.min(m.pct * 100, 100)}%` }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-[12px] font-bold ${m.overCap ? 'text-red-500' : m.pct > 0.85 ? 'text-amber-500' : 'text-green-600'}`}>
                      {Math.round(m.pct * 100)}%{m.overCap && ' ⚠ Excede'}
                    </span>
                    <span className="text-[11px] text-kmuted">{m.tb}b</span>
                  </div>
                </div>
                <div className="px-3 py-2.5">
                  <div className="text-[10px] font-bold text-kmuted uppercase tracking-[0.5px] mb-1.5">Ruta estimada</div>
                  {m.kmEst > 0 ? (
                    <>
                      <div className="flex items-end gap-1 mb-1">
                        <span className="text-[22px] font-bold leading-none text-ktext">{m.kmEst}</span>
                        <span className="text-[13px] text-kmuted mb-0.5">km</span>
                      </div>
                      <div className="text-[11px] text-kmuted">CD → {stores.length} tienda{stores.length !== 1 ? 's' : ''} → CD</div>
                    </>
                  ) : (
                    <div className="flex flex-col gap-1 mt-1">
                      <span className="text-[18px] font-bold text-kmuted/30">— km</span>
                      <span className="text-[11px] text-kmuted/50 italic">Sin tiendas asignadas</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-3 pb-3 pt-2 flex flex-wrap gap-[5px] min-h-[44px]">
                {stores.length === 0 ? (
                  <span className={`text-[11px] italic transition-colors ${isOver ? 'text-kred/70' : 'text-kmuted/50'}`}>
                    {isOver || isSelected ? '↓ Suelta aquí' : 'Arrastra tiendas o paradas aquí'}
                  </span>
                ) : (
                  stores.map(t => {
                    const parada = paradas.find(p => p.id === t.c);
                    return parada ? (
                      <ParadaTagComp
                        key={t.c} parada={parada}
                        isDragging={dragging?.c === t.c}                        onDragStart={e => handleDragStart(e, t, v.p)}
                        onDragEnd={handleDragEnd}
                        onTouchStart={e => handleTouchStart(e, t, v.p)}
                        onRemove={() => removeStore(v.p, t.c)}
                      />
                    ) : (
                      <StoreTagComp
                        key={t.c} store={t} tiendas={tiendas}
                        isDragging={dragging?.c === t.c}                        onDragStart={e => handleDragStart(e, t, v.p)}
                        onDragEnd={handleDragEnd}
                        onTouchStart={e => handleTouchStart(e, t, v.p)}
                        onRemove={() => removeStore(v.p, t.c)}
                      />
                    );
                  })
                )}
              </div>
            </div>
          );
        })
      )}

      {issues.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-kios2 px-3 py-2.5 text-[12px] text-amber-800 leading-relaxed">
          ⚠️ {issues.join(' · ')}
        </div>
      )}

      {tiendasCount > 0 && (
        <button
          onClick={onCalcular}
          disabled={pendientesTotal > 0 || issues.some(i => i.includes('excede'))}
          className={`w-full h-[50px] rounded-kios2 text-[15px] font-bold transition-all flex items-center justify-center gap-2
            ${pendientesTotal > 0 || issues.some(i => i.includes('excede'))
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
              : 'bg-kred text-white shadow-[0_4px_14px_rgba(212,43,43,0.3)] active:scale-[0.98]'}`}
        >
          {pendientesTotal > 0
            ? `Asigna ${pendientesTotal} parada${pendientesTotal > 1 ? 's' : ''} restante${pendientesTotal > 1 ? 's' : ''} para continuar`
            : '🔍 Calcular y Comparar Rutas'}
        </button>
      )}
    </div>
  );
}

function ParadaTagComp({ parada, isDragging, onDragStart, onDragEnd, onTouchStart, onRemove }: {
  parada: Parada; isDragging: boolean;
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
        : isEntrega
          ? 'bg-blue-50 border-blue-200 text-blue-700 active:bg-blue-100'
          : 'bg-orange-50 border-orange-200 text-orange-700 active:bg-orange-100'}`}
    >
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

function StoreTagComp({ store, tiendas, isDragging, onDragStart, onDragEnd, onTouchStart, onRemove }: {
  store: StoreTag; tiendas: Record<string, TiendaInfo>; isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onRemove: (() => void) | null;
}) {
  const info = tiendas[store.c];
  return (
    <div
      draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onTouchStart={onTouchStart}
      className={`flex items-center gap-1 rounded-[6px] px-2 py-[5px] cursor-grab select-none transition-all border min-h-[36px] touch-manipulation ${isDragging
        ? 'opacity-30 scale-95 bg-kred/[0.05] border-kred/20'
        : 'bg-kred/[0.07] border-kred/25 text-kred active:bg-kred/[0.15]'}`}
      title={info ? `${info.n} · ${store.p}p ${store.b}b` : `${store.c} · ${store.p}p ${store.b}b`}
    >
      <span className="font-mono font-bold text-[12px]">{formatCod(store.c)}</span>
      <span className="text-[10px] text-kred/60">{store.p}p</span>
      {store.b > 0 && <span className="text-[10px] text-kred/50">{store.b}b</span>}
      {onRemove && (
        <button onClick={e => { e.stopPropagation(); onRemove(); }} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}
          className="text-[11px] text-kred/40 hover:text-kred font-bold leading-none ml-0.5 w-[14px] h-[14px] flex items-center justify-center">×</button>
      )}
    </div>
  );
}
