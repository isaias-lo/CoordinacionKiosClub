'use client';
import CalendarMode   from './CalendarMode';
import ManualMode     from './ManualMode';
import FlotaGrid      from './FlotaGrid';
import ManualDispatch from './ManualDispatch';
import { getDia }     from '../utils/helpers';
import type { Vehiculo } from '../data/flota';
import type { TiendaInfo } from '../data/tiendas';
import type { Parada } from './ParadasAdicionales';

interface CalData { on: boolean; p: number; b: number; g?: string; }
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
  onUpdateChip: (cod: string, key: 'p' | 'b', val: string) => void;
  onToggleFlota: (idx: number) => void;
  onConductorChange: (idx: number, nombre: string) => void;
  onAgregarConductor: (nombre: string) => void;
  onAgregarVehiculo: (v: Vehiculo) => void;
  onSupervisor: (s: string) => void;
  onFecha: (f: string) => void;
  onManual: (t: string) => void;
  onAsignaciones: (a: Record<string, StoreAssign[]>) => void;
  onCalcular: () => void;
  onCalcularManual: () => void;
  onLimpiar: () => void;
}

export default function InputSection({
  flota, conductores, modo, grps, calT, supervisor, fecha, manualText, errors,
  dnom, tiendas, gps, cd, manualAsignaciones,
  paradasAdicionales, onOpenParadas,
  onModo, onToggleGroup, onToggleChip, onUpdateChip,
  onToggleFlota, onConductorChange, onAgregarConductor, onAgregarVehiculo,
  onSupervisor, onFecha, onManual, onAsignaciones,
  onCalcular, onCalcularManual, onLimpiar,
}: Props) {
  const dia = getDia(fecha);

  return (
    <div id="sec-input">
      <div className="mb-[7px]">
        <div className="text-[11px] font-semibold text-kmuted uppercase tracking-[1px] mb-1">01 — Ingreso de datos</div>
        <div className="text-[26px] font-bold text-ktext tracking-tight mb-[3px]">Despacho del día</div>
        <div className="text-[14px] text-kmuted leading-relaxed">
          Ingresa las tiendas y el sistema asigna camiones y sugiere el orden de entrega por cercanía GPS.
        </div>
      </div>

      <div className="bg-white rounded-kios shadow-kios overflow-hidden mb-3.5">
        <div className="px-4 py-3.5">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <span className="absolute -top-2 left-[9px] text-[10px] font-bold text-kmuted bg-kbg px-[3px] tracking-[0.5px] uppercase">Supervisor</span>
              <input
                type="text" value={supervisor}
                onChange={e => onSupervisor(e.target.value)}
                placeholder="Tu nombre"
                className="w-full h-[42px] px-3 bg-kbg border-[1.5px] border-black/[0.09] rounded-kios2 text-[14px] text-ktext transition-colors focus:border-kred focus:outline-none"
              />
            </div>
            <input
              type="date" value={fecha}
              onChange={e => onFecha(e.target.value)}
              className="h-[38px] px-2.5 rounded-[8px] bg-kbg border-[1.5px] border-black/[0.09] text-[13px] text-ktext focus:border-kred focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-kios shadow-kios overflow-hidden mb-3.5">
        <div className="px-4 py-3 border-b border-black/[0.09]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[15px] font-bold text-ktext">📦 Tiendas a despachar</span>
            <span className="text-[15px] font-semibold text-kmuted">{dnom[dia] || ''}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenParadas}
              className="flex items-center gap-2 h-[32px] px-3 rounded-[8px] bg-kred/[0.08] border border-kred/[0.2] text-kred text-[15px] font-bold hover:bg-kred/[0.14] transition-all active:scale-[0.97]"
            >
              <span className="text-[18px] leading-none font-bold">+</span>
              <span>Agregar parada</span>
              {paradasAdicionales.length > 0 && (
                <span className="bg-kred text-white text-[9px] font-extrabold px-1.5 py-px rounded-full min-w-[15px] text-center leading-normal">
                  {paradasAdicionales.length}
                </span>
              )}
            </button>
          </div>
        </div>
        <div className="px-4 py-3.5">
          <div className="flex bg-kbg rounded-kios2 p-[4px] mb-3">
            {([['cal','📅 Calendario'],['man','✏️ Manual'],['drag','🎯 Despacho']] as [string, string][]).map(([id, lb]) => (
              <button
                key={id}
                onClick={() => onModo(id)}
                className={`flex-1 h-[34px] rounded-[8px] text-[15px] font-semibold flex items-center justify-center gap-[4px] transition-all
                  ${modo === id ? 'bg-white text-kred shadow-sm' : 'text-kmuted bg-transparent'}`}
              >
                {lb}
              </button>
            ))}
          </div>

          {modo === 'cal' && (
            <CalendarMode calT={calT} grps={grps} onToggleGroup={onToggleGroup} onToggleChip={onToggleChip} onUpdateChip={onUpdateChip} />
          )}
          {modo === 'man' && (
            <ManualMode value={manualText} onChange={onManual} calT={calT} modo={modo} />
          )}
          {modo === 'drag' && (
            <>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="w-[18px] h-[18px] rounded-full bg-kred text-white text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                <span className="text-[12px] font-bold text-ktext">Activa las tiendas e ingresa cantidades</span>
              </div>
              <CalendarMode calT={calT} grps={grps} onToggleGroup={onToggleGroup} onToggleChip={onToggleChip} onUpdateChip={onUpdateChip} />
              <div className="flex items-center gap-2 mt-4 mb-1">
                <span className="w-[18px] h-[18px] rounded-full bg-kred text-white text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                <span className="text-[12px] font-bold text-ktext">Arrastra las tiendas a cada vehículo</span>
              </div>
            </>
          )}
        </div>
      </div>

      {modo !== 'drag' && errors.length > 0 && (
        <div className="bg-[#FFF3CD] border border-amber-400 rounded-kios2 px-3 py-[11px] text-[13px] text-amber-800 mb-[11px] leading-relaxed">
          ⚠️ {errors.join(' · ')}
        </div>
      )}

      {modo !== 'drag' && (
        <FlotaGrid
          flota={flota} conductores={conductores}
          onToggle={onToggleFlota} onConductorChange={onConductorChange}
          onAgregarConductor={onAgregarConductor} onAgregarVehiculo={onAgregarVehiculo}
        />
      )}

      {modo === 'drag' && (
        <div className="bg-white rounded-kios shadow-kios overflow-hidden mb-3.5">
          <div className="px-4 py-3 border-b border-black/[0.09] flex items-center justify-between">
            <span className="text-[15px] font-bold text-ktext">🚛 Flota disponible hoy</span>
            <span className="text-[11px] text-kmuted">{flota.filter(v => v.on).length} activos</span>
          </div>
          <div className="px-4 py-3.5">
            <ManualDispatch
              calT={calT} flota={flota} gps={gps} tiendas={tiendas} cd={cd}
              paradas={paradasAdicionales}
              asignaciones={manualAsignaciones}
              onAsignaciones={onAsignaciones}
              onCalcular={onCalcularManual}
              conductores={conductores}
              onConductorChange={onConductorChange}
              onAgregarConductor={onAgregarConductor}
            />
          </div>
        </div>
      )}

      {modo !== 'drag' && (
        <div className="flex gap-[9px]">
          <button
            onClick={onCalcular}
            className="flex-1 h-[50px] rounded-kios2 bg-kred text-white text-[16px] font-bold shadow-[0_4px_14px_rgba(212,43,43,0.3)] transition-all active:scale-[0.98] flex items-center justify-center gap-[7px]"
          >
            🚛 Calcular Rutas
          </button>
          <button
            onClick={onLimpiar}
            className="h-[42px] px-4 rounded-kios2 bg-kbg text-kmuted text-[14px] font-semibold border-[1.5px] border-black/[0.09]"
          >
            Limpiar
          </button>
        </div>
      )}

      {modo === 'drag' && (
        <button
          onClick={onLimpiar}
          className="w-full h-[38px] rounded-kios2 bg-kbg text-kmuted text-[13px] font-semibold border-[1.5px] border-black/[0.09] mt-1"
        >
          Limpiar todo
        </button>
      )}
    </div>
  );
}
