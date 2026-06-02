'use client';
import { useState } from 'react';
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
      className={`flex items-center gap-1.5 rounded-[10px] px-2 py-[5px] border transition-all
        ${data.on
          ? 'border-kred/[0.25] bg-kred/[0.04]'
          : 'border-black/[0.07] bg-white/70 opacity-50'}`}
    >
      <button
        onClick={() => onToggle(cod)}
        className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
      >
        <span className={`w-[6px] h-[6px] rounded-full flex-shrink-0 transition-colors ${data.on ? 'bg-kred' : 'bg-black/20'}`} />
        <span className={`font-mono text-[12px] font-bold truncate transition-colors ${data.on ? 'text-kred' : 'text-kmuted'}`}>
          {formatCod(cod)}
        </span>
      </button>
      <div className="flex gap-[3px] flex-shrink-0" onClick={e => e.stopPropagation()}>
        {(['p', 'b', 'c', 'ch'] as const).map(key => (
          <div
            key={key}
            className="flex items-center w-[30px] h-[20px] rounded-[4px] bg-black/[0.04] border border-black/[0.07] px-[2px] gap-[1px]"
          >
            <span className="text-[7px] font-bold text-kmuted/50 leading-none select-none uppercase">{key}</span>
            <input
              type="number" min="0" max={key === 'p' ? 20 : 99}
              value={data[key] || ''}
              placeholder="0"
              onChange={e => onUpdate(cod, key, e.target.value)}
              className="w-full bg-transparent text-[10px] font-bold text-center text-ktext focus:outline-none [-webkit-appearance:none]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

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

  const filteredCalT = sidebarFilter === 'all'
    ? calT
    : Object.fromEntries(Object.entries(calT).filter(([, d]) => d.g === sidebarFilter));

  const activeCount = Object.values(calT).filter(d => d.on && (d.p > 0 || d.b > 0)).length;

  return (
    <div className="flex h-full overflow-hidden">

      {/* ═══════════════════════════════════════
          LEFT SIDEBAR — Store configuration
      ═══════════════════════════════════════ */}
      <div className="w-[250px] md:w-[270px] xl:w-[300px] flex-shrink-0 border-r border-black/[0.09] flex flex-col bg-white overflow-hidden">

        {/* Supervisor + Date */}
        <div className="px-3 py-2.5 border-b border-black/[0.09] space-y-2">
          <div className="relative">
            <span className="absolute -top-[7px] left-2 text-[9px] font-bold text-kmuted bg-white px-[3px] uppercase tracking-wide">Supervisor</span>
            <input
              type="text"
              value={supervisor}
              onChange={e => onSupervisor(e.target.value)}
              placeholder="Tu nombre"
              className="w-full h-[36px] px-2.5 bg-kbg border-[1.5px] border-black/[0.09] rounded-[8px] text-[13px] text-ktext focus:border-kred focus:outline-none transition-colors"
            />
          </div>
          <input
            type="date"
            value={fecha}
            onChange={e => onFecha(e.target.value)}
            className="w-full h-[32px] px-2 rounded-[8px] bg-kbg border-[1.5px] border-black/[0.09] text-[12px] text-ktext focus:border-kred focus:outline-none transition-colors"
          />
        </div>

        {/* Header + Paradas button */}
        <div className="px-3 pt-2 pb-1.5 border-b border-black/[0.09] flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold text-kmuted uppercase tracking-wide truncate">
              Tiendas del día · {dnom[dia] || ''}
            </div>
            <div className="text-[12px] font-bold text-ktext">
              {activeCount} con carga activa
            </div>
          </div>
          <button
            onClick={onOpenParadas}
            className="flex-shrink-0 flex items-center gap-1 h-[26px] px-2 rounded-[7px] bg-kred/[0.08] border border-kred/[0.2] text-kred text-[11px] font-bold hover:bg-kred/[0.14] active:scale-95 transition-all"
          >
            <span className="text-[14px] leading-none font-bold">+</span>
            <span>Parada</span>
            {paradasAdicionales.length > 0 && (
              <span className="bg-kred text-white text-[8px] font-extrabold w-[14px] h-[14px] rounded-full flex items-center justify-center">
                {paradasAdicionales.length}
              </span>
            )}
          </button>
        </div>

        {/* View filter tabs */}
        <div className="flex px-2 pt-2 pb-1 gap-1">
          {(['all', 'rm', 'costa', 'fal'] as const).map(id => {
            const label = id === 'all' ? 'Todas' : id === 'rm' ? 'RM' : id === 'costa' ? 'Costa' : 'Reg.';
            return (
              <button
                key={id}
                onClick={() => setSidebarFilter(id)}
                className={`flex-1 h-[22px] rounded-[6px] text-[10px] font-bold transition-all
                  ${sidebarFilter === id ? 'bg-knavy text-white' : 'bg-kbg text-kmuted hover:text-ktext'}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Group active toggles */}
        <div className="flex px-2 pb-1.5 gap-1">
          {(['rm', 'costa', 'fal'] as const).map(id => {
            const label = id === 'rm' ? 'RM' : id === 'costa' ? 'Costa' : 'Reg.';
            const active = grps.has(id);
            return (
              <button
                key={id}
                onClick={() => onToggleGroup(id)}
                className={`flex-1 h-[20px] rounded-[5px] text-[9px] font-bold transition-all border
                  ${active
                    ? 'bg-kred/[0.08] border-kred/[0.25] text-kred'
                    : 'bg-kbg border-transparent text-kmuted hover:text-ktext'}`}
              >
                {active ? '✓' : '·'} {label}
              </button>
            );
          })}
        </div>

        {/* Store list */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-[3px]">
          {Object.keys(filteredCalT).length === 0 ? (
            <div className="text-center text-[11px] text-kmuted/60 py-8">
              Sin tiendas disponibles
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
          <div className="px-2 py-2 border-t border-black/[0.09] flex-shrink-0">
            <div className="bg-amber-50 border border-amber-200 rounded-[8px] px-2.5 py-2 text-[11px] text-amber-700 leading-relaxed">
              ⚠️ {errors.join(' · ')}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════
          RIGHT PANEL — Assignment / Calculation
      ═══════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden bg-kbg min-w-0">

        {/* Top bar: mode tabs + actions */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 bg-white border-b border-black/[0.09]">
          <div className="flex bg-kbg rounded-[10px] p-[3px] gap-0.5">
            {([
              ['drag', '🎯 Despacho'],
              ['cal',  '🚛 Calcular'],
              ['man',  '✏️ Manual'],
            ] as [string, string][]).map(([id, lb]) => (
              <button
                key={id}
                onClick={() => onModo(id)}
                className={`h-[30px] px-3 rounded-[8px] text-[12px] font-semibold transition-all
                  ${modo === id ? 'bg-white text-kred shadow-sm' : 'text-kmuted hover:text-ktext'}`}
              >
                {lb}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          {modo !== 'drag' && (
            <button
              onClick={onCalcular}
              className="h-[36px] px-5 rounded-[10px] bg-kred text-white text-[13px] font-bold shadow-[0_3px_10px_rgba(212,43,43,0.25)] transition-all active:scale-[0.98] hover:shadow-[0_4px_14px_rgba(212,43,43,0.35)]"
            >
              🚛 Calcular Rutas
            </button>
          )}
          <button
            onClick={onLimpiar}
            className="h-[36px] px-3 rounded-[10px] bg-kbg border border-black/[0.09] text-kmuted text-[13px] font-semibold hover:text-ktext transition-all"
          >
            Limpiar
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {modo === 'drag' && (
            <div className="p-3">
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

          {modo === 'cal' && (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <div className="text-[44px] mb-4">🚛</div>
              <div className="text-[20px] font-bold text-ktext mb-2">Cálculo automático</div>
              <div className="text-[14px] text-kmuted mb-8 max-w-sm leading-relaxed">
                Las tiendas están en el panel izquierdo. El sistema asignará camiones por cercanía GPS y optimizará el orden de entrega.
              </div>
              <button
                onClick={onCalcular}
                className="h-[52px] px-10 rounded-[14px] bg-kred text-white text-[16px] font-bold shadow-[0_4px_14px_rgba(212,43,43,0.3)] transition-all active:scale-[0.98]"
              >
                🚛 Calcular Rutas
              </button>
              <div className="mt-4 text-[12px] text-kmuted/60">
                {activeCount > 0
                  ? `${activeCount} tiendas activas con carga`
                  : 'Activa tiendas en el panel izquierdo primero'}
              </div>
            </div>
          )}

          {modo === 'man' && (
            <div className="p-4 max-w-[640px]">
              <ManualMode value={manualText} onChange={onManual} calT={calT} modo={modo} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
