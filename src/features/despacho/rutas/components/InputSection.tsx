'use client';
import { useState, useEffect, useRef } from 'react';
import ManualMode     from './ManualMode';
import ManualDispatch from './ManualDispatch';
import { getDia, formatCod } from '../utils/helpers';
import type { Vehiculo } from '../data/flota';
import type { TiendaInfo } from '../data/tiendas';
import type { Parada } from './ParadasAdicionales';

interface CalData { on: boolean; p: number; b: number; c: number; ch: number; g?: string; }
interface StoreAssign { c: string; p: number; b: number; }

interface Props {
  flota: Vehiculo[];
  conductores: string[];
  modo: string;
  grps: Set<string>;
  calT: Record<string, CalData>;
  supervisor: string;
  fecha: string;
  manualText: string;
  errors: string[];
  dnom: Record<string, string>;
  tiendas: Record<string, TiendaInfo>;
  gps: Record<string, number[]>;
  cd: number[];
  manualAsignaciones: Record<string, StoreAssign[]>;
  paradasAdicionales: Parada[];
  onOpenParadas: () => void;
  onModo: (m: string) => void;
  onToggleGroup: (gid: string) => void;
  onToggleChip: (cod: string) => void;
  onUpdateChip: (cod: string, key: 'p' | 'b' | 'c' | 'ch', val: string) => void;
  onConductorChange: (idx: number, nombre: string) => void;
  onAgregarConductor: (nombre: string) => void;
  onSupervisor: (s: string) => void;
  onFecha: (f: string) => void;
  onManual: (t: string) => void;
  onAsignaciones: (a: Record<string, StoreAssign[]>) => void;
  onCalcular: () => void;
  onCalcularManual: () => void;
  onLimpiar: () => void;
  onEliminarParada?: (id: string) => void;
}

/* ── Sidebar store row ──────────────────────────────────────────── */
function SidebarRow({
  cod, data, onToggle, onUpdate,
}: {
  cod: string;
  data: CalData;
  onToggle: (cod: string) => void;
  onUpdate: (cod: string, key: 'p' | 'b' | 'c' | 'ch', val: string) => void;
}) {
  return (
    <div
      style={{
        boxShadow: data.on
          ? '0 1px 4px rgba(212,43,43,0.10), 0 1px 2px rgba(0,0,0,0.04)'
          : '0 1px 2px rgba(0,0,0,0.04)',
      }}
      className={`flex items-center gap-2 rounded-[12px] px-2.5 py-[7px] border transition-all
        ${data.on
          ? 'border-kred/[0.28] bg-kred/[0.04]'
          : 'border-black/[0.07] bg-white opacity-50 hover:opacity-70'}`}
    >
      <button
        onClick={() => onToggle(cod)}
        className="flex items-center gap-2 flex-1 min-w-0 text-left"
      >
        <span
          className={`w-[8px] h-[8px] rounded-full flex-shrink-0 transition-colors ${data.on ? 'bg-kred' : 'bg-black/20'}`}
        />
        <span className={`font-mono text-[13px] font-bold truncate transition-colors ${data.on ? 'text-kred' : 'text-kmuted'}`}>
          {formatCod(cod)}
        </span>
      </button>
      <div className="flex gap-[4px] flex-shrink-0" onClick={e => e.stopPropagation()}>
        {(['p', 'b', 'c', 'ch'] as const).map(key => (
          <div key={key} className="flex flex-col items-center w-[32px] rounded-[6px] bg-black/[0.04] border border-black/[0.07] pt-[2px] pb-[1px] px-[2px]">
            <span className="text-[8px] font-bold text-kmuted/50 leading-none select-none uppercase">{key}</span>
            <input
              type="number" min="0" max={key === 'p' ? 20 : 99}
              value={data[key] || ''}
              placeholder="0"
              onChange={e => onUpdate(cod, key, e.target.value)}
              className="w-full bg-transparent text-[12px] font-bold text-center text-ktext focus:outline-none [-webkit-appearance:none] leading-none"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Group badge ─────────────────────────────────────────────────── */
function GroupBadge({ active, label, onClick }: { id?: string; active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={active ? { boxShadow: '0 2px 8px rgba(212,43,43,0.20)' } : undefined}
      className={`flex-1 h-[28px] rounded-[8px] text-[11px] font-bold transition-all border
        ${active
          ? 'bg-kred text-white border-kred'
          : 'bg-white border-black/[0.10] text-kmuted hover:border-kred/[0.3] hover:text-kred'}`}
    >
      {label}
    </button>
  );
}

/* ── Main component ──────────────────────────────────────────────── */
export default function InputSection({
  flota, conductores, modo, grps, calT, supervisor, fecha, manualText, errors,
  dnom, tiendas, gps, cd, manualAsignaciones,
  paradasAdicionales, onOpenParadas,
  onModo, onToggleGroup, onToggleChip, onUpdateChip,
  onConductorChange, onAgregarConductor,
  onSupervisor, onFecha, onManual, onAsignaciones,
  onCalcular, onCalcularManual, onLimpiar, onEliminarParada,
}: Props) {
  const dia = getDia(fecha);
  const [sidebarFilter, setSidebarFilter] = useState<'all' | 'rm' | 'costa' | 'fal'>('all');

  /* ── Resizable sidebar ── */
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 300;
    return Number(localStorage.getItem('enrutador_sidebar_width') ?? '300');
  });
  const [isDesktop, setIsDesktop] = useState(false);
  const isResizingRef     = useRef(false);
  const dragStartXRef     = useRef(0);
  const dragStartWidthRef = useRef(0);

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 1024);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const next = Math.min(520, Math.max(200, dragStartWidthRef.current + e.clientX - dragStartXRef.current));
      setLeftWidth(next);
    };
    const onMouseUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setLeftWidth(w => { localStorage.setItem('enrutador_sidebar_width', String(w)); return w; });
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isResizingRef.current) return;
      const next = Math.min(520, Math.max(200, dragStartWidthRef.current + e.touches[0].clientX - dragStartXRef.current));
      setLeftWidth(next);
    };
    const onTouchEnd = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      setLeftWidth(w => { localStorage.setItem('enrutador_sidebar_width', String(w)); return w; });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('resize', checkDesktop);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  const filteredCalT = sidebarFilter === 'all'
    ? calT
    : Object.fromEntries(Object.entries(calT).filter(([, d]) => d.g === sidebarFilter));

  const activeCount = Object.values(calT).filter(d => d.on && (d.p > 0 || d.b > 0)).length;
  const totalStores = Object.keys(calT).length;

  const sidebarStyle = isDesktop ? { width: leftWidth, flexShrink: 0 } : undefined;
  const sidebarClass = isDesktop ? '' : 'w-[260px] md:w-[290px]';

  return (
    <div className="flex h-full overflow-hidden">

      {/* ═══════════════════════════════════════════════
          LEFT SIDEBAR — Store configuration
      ═══════════════════════════════════════════════ */}
      <div
        className={`${sidebarClass} flex-shrink-0 border-r border-black/[0.09] flex flex-col bg-white overflow-hidden`}
        style={sidebarStyle}
      >

        {/* Supervisor + Date */}
        <div className="px-4 pt-4 pb-3 border-b border-black/[0.08] space-y-3 bg-white">
          <div className="relative">
            <span className="absolute -top-[8px] left-3 text-[10px] font-bold text-kmuted bg-white px-1 uppercase tracking-wider">
              Supervisor
            </span>
            <input
              type="text"
              value={supervisor}
              onChange={e => onSupervisor(e.target.value)}
              placeholder="Tu nombre"
              className="w-full h-[42px] px-3 bg-kbg border-[1.5px] border-black/[0.09] rounded-[10px] text-[14px] font-semibold text-ktext focus:border-kred focus:outline-none transition-colors placeholder:text-kmuted/50"
            />
          </div>
          <input
            type="date"
            value={fecha}
            onChange={e => onFecha(e.target.value)}
            className="w-full h-[38px] px-3 rounded-[10px] bg-kbg border-[1.5px] border-black/[0.09] text-[13px] font-semibold text-ktext focus:border-kred focus:outline-none transition-colors"
          />
        </div>

        {/* Header + Paradas */}
        <div className="px-4 py-3 border-b border-black/[0.08] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-kmuted uppercase tracking-wider mb-0.5 truncate">
              {dnom[dia] || 'Hoy'} · {totalStores} tiendas
            </div>
            <div className="text-[15px] font-bold text-ktext leading-tight">
              {activeCount > 0 ? `${activeCount} con carga` : 'Sin carga asignada'}
            </div>
          </div>
          <button
            onClick={onOpenParadas}
            style={{ boxShadow: '0 1px 4px rgba(212,43,43,0.18)' }}
            className="flex-shrink-0 flex items-center gap-1.5 h-[32px] px-3 rounded-[10px] bg-kred text-white text-[12px] font-bold hover:bg-kred/90 active:scale-95 transition-all"
          >
            <span className="text-[16px] leading-none">+</span>
            <span>Parada</span>
            {paradasAdicionales.length > 0 && (
              <span className="bg-white/30 text-white text-[9px] font-extrabold w-[16px] h-[16px] rounded-full flex items-center justify-center">
                {paradasAdicionales.length}
              </span>
            )}
          </button>
        </div>

        {/* Group toggles */}
        <div className="px-3 pt-3 pb-2">
          <div className="text-[10px] font-semibold text-kmuted/70 uppercase tracking-wider mb-2">Grupos activos</div>
          <div className="flex gap-2">
            <GroupBadge id="rm"    active={grps.has('rm')}    label="RM"       onClick={() => onToggleGroup('rm')} />
            <GroupBadge id="costa" active={grps.has('costa')} label="Costa"    onClick={() => onToggleGroup('costa')} />
            <GroupBadge id="fal"   active={grps.has('fal')}   label="Regiones" onClick={() => onToggleGroup('fal')} />
          </div>
        </div>

        {/* View filter tabs */}
        <div className="px-3 pb-2">
          <div className="flex bg-kbg rounded-[10px] p-[3px] gap-0.5">
            {(['all', 'rm', 'costa', 'fal'] as const).map(id => {
              const label = id === 'all' ? 'Todas' : id === 'rm' ? 'RM' : id === 'costa' ? 'Costa' : 'Reg.';
              return (
                <button
                  key={id}
                  onClick={() => setSidebarFilter(id)}
                  className={`flex-1 h-[26px] rounded-[8px] text-[11px] font-bold transition-all
                    ${sidebarFilter === id ? 'bg-knavy text-white shadow-sm' : 'text-kmuted hover:text-ktext'}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Store list */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-[5px]">
          {Object.keys(filteredCalT).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-[28px] mb-2">🏪</div>
              <div className="text-[13px] font-semibold text-kmuted">Sin tiendas</div>
              <div className="text-[11px] text-kmuted/60 mt-1">Activa grupos arriba</div>
            </div>
          ) : (
            Object.entries(filteredCalT).map(([cod, data]) => (
              <SidebarRow
                key={cod}
                cod={cod}
                data={data}
                onToggle={onToggleChip}
                onUpdate={onUpdateChip}
              />
            ))
          )}
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="px-3 pb-3 flex-shrink-0">
            <div
              style={{ boxShadow: '0 1px 4px rgba(245,158,11,0.15)' }}
              className="bg-amber-50 border border-amber-200 rounded-[10px] px-3 py-2.5 text-[12px] text-amber-700 leading-relaxed"
            >
              ⚠️ {errors.join(' · ')}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════
          RESIZE DIVIDER — desktop only
      ═══════════════════════════════════════════════ */}
      {isDesktop && (
        <div
          className="group flex-shrink-0 cursor-col-resize flex items-center justify-center relative select-none z-10"
          style={{ width: 6, background: 'rgba(0,0,0,0.05)' }}
          onMouseDown={e => {
            isResizingRef.current = true;
            dragStartXRef.current = e.clientX;
            dragStartWidthRef.current = leftWidth;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
          }}
          onTouchStart={e => {
            isResizingRef.current = true;
            dragStartXRef.current = e.touches[0].clientX;
            dragStartWidthRef.current = leftWidth;
          }}
        >
          <div className="absolute inset-0 group-hover:bg-kred/[0.18] transition-colors duration-150" />
          <div className="flex flex-col gap-[5px] relative z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-[5px] h-[5px] rounded-full bg-kred/70" />
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          RIGHT PANEL — Assignment / Calculation
      ═══════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden bg-kbg min-w-0">

        {/* ── Mode tab bar ── */}
        <div className="flex-shrink-0 bg-white border-b border-black/[0.09]" style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06)' }}>
          <div className="flex items-center gap-3 px-4 py-3">
            {/* Mode tabs */}
            <div className="flex bg-kbg rounded-[12px] p-[4px] gap-1">
              {([
                ['drag', '🎯', 'Despacho'],
                ['cal',  '🚛', 'Calcular'],
                ['man',  '✏️', 'Manual'],
              ] as [string, string, string][]).map(([id, icon, label]) => (
                <button
                  key={id}
                  onClick={() => onModo(id)}
                  style={modo === id ? { boxShadow: '0 1px 4px rgba(0,0,0,0.10)' } : undefined}
                  className={`h-[36px] px-4 rounded-[9px] text-[13px] font-bold flex items-center gap-1.5 transition-all
                    ${modo === id ? 'bg-white text-kred' : 'text-kmuted hover:text-ktext'}`}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <div className="flex-1" />

            {/* Action buttons */}
            {modo !== 'drag' && (
              <button
                onClick={onCalcular}
                style={{ boxShadow: '0 3px 12px rgba(212,43,43,0.28)' }}
                className="h-[40px] px-6 rounded-[12px] bg-kred text-white text-[14px] font-bold transition-all active:scale-[0.97] hover:bg-kred/90 flex items-center gap-2"
              >
                🚛 <span>Calcular Rutas</span>
              </button>
            )}
            <button
              onClick={onLimpiar}
              className="h-[40px] px-4 rounded-[12px] bg-kbg border border-black/[0.10] text-kmuted text-[13px] font-semibold hover:text-ktext hover:border-black/[0.18] transition-all"
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* ── Content area ── */}
        <div className="flex-1 overflow-y-auto">

          {/* 🎯 DESPACHO MODE */}
          {modo === 'drag' && (
            <div className="p-4">
              <ManualDispatch
                calT={calT}
                flota={flota}
                gps={gps}
                tiendas={tiendas}
                cd={cd}
                paradas={paradasAdicionales}
                asignaciones={manualAsignaciones}
                onAsignaciones={onAsignaciones}
                onCalcular={onCalcularManual}
                conductores={conductores}
                onConductorChange={onConductorChange}
                onAgregarConductor={onAgregarConductor}
                onEliminarParada={onEliminarParada}
              />
            </div>
          )}

          {/* 🚛 CALCULAR MODE */}
          {modo === 'cal' && (
            <div className="flex flex-col items-center justify-center h-full p-10 text-center">
              <div
                style={{ boxShadow: '0 8px 32px rgba(27,42,107,0.12)', background: 'linear-gradient(145deg, #1B2A6B, #2D3FA0)' }}
                className="w-[72px] h-[72px] rounded-[20px] flex items-center justify-center text-[36px] mb-6"
              >
                🚛
              </div>
              <div className="text-[22px] font-bold text-ktext mb-2">Cálculo automático de rutas</div>
              <div className="text-[14px] text-kmuted mb-10 max-w-md leading-relaxed">
                Las tiendas y cantidades están en el panel izquierdo. El sistema asigna camiones por cercanía GPS y optimiza el orden de entrega.
              </div>
              <button
                onClick={onCalcular}
                style={{ boxShadow: '0 6px 20px rgba(212,43,43,0.32)' }}
                className="h-[56px] px-12 rounded-[16px] bg-kred text-white text-[17px] font-bold transition-all active:scale-[0.97] hover:bg-kred/90 flex items-center gap-3"
              >
                🚛 <span>Calcular Rutas</span>
              </button>
              <div className="mt-6 text-[13px] text-kmuted/60">
                {activeCount > 0
                  ? `${activeCount} tiendas activas con carga`
                  : 'Activa tiendas en el panel izquierdo primero'}
              </div>
            </div>
          )}

          {/* ✏️ MANUAL MODE */}
          {modo === 'man' && (
            <div className="p-6 max-w-[680px]">
              <div className="text-[11px] font-semibold text-kmuted uppercase tracking-wider mb-3">Ingreso manual</div>
              <ManualMode value={manualText} onChange={onManual} calT={calT} modo={modo} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
