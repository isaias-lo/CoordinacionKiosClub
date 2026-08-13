'use client';
import { useState, useRef, useEffect } from 'react';
import { Target, PenLine, Truck, Users, ClipboardList, RotateCcw, Send, CalendarDays, Map as MapIcon, Flag } from 'lucide-react';
type LIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
import ManualMode     from './ManualMode';
import ManualDispatch from './ManualDispatch';
import FlotaGrid      from './FlotaGrid';
import FlotaInternaPanel from './FlotaInternaPanel';
import PlanificadorTab from './PlanificadorTab';
import { ControlFlotaPanel, PersonalCatalogPanel } from '@/features/despacho/control-flota/ControlFlotaPanel';
import CalendarioColumnas from '@/features/control-interno/CalendarioColumnas';
import { useIsMobile } from '../utils/useIsMobile';
import type { Vehiculo } from '../data/flota';
import type { Ruta } from '../utils/routing';
import type { TiendaInfo } from '../data/tiendas';
import type { Parada } from './ParadasAdicionales';

interface CalData { on: boolean; p: number; b: number; c: number; ch: number; g?: string; }
interface StoreAssign { c: string; p: number; b: number; }

interface Props {
  flota: Vehiculo[];
  flotaStatus?: string;
  modo: string;
  calT: Record<string, CalData>;
  manualText: string;
  errors: string[];
  tiendas: Record<string, TiendaInfo>;
  gps: Record<string, number[]>;
  cd: number[];
  manualAsignaciones: Record<string, StoreAssign[]>;
  paradasAdicionales: Parada[];
  // Filtro de grupo (RM/COSTA/REGIONES) — sus pills viven en la fila "Sin asignar" del board
  // (ManualDispatch). `grps` = grupos activos del calendario; `onGroupPill` togglea/filtra.
  grupoFiltro: 'all' | 'rm' | 'costa' | 'fal';
  grps: Set<string>;
  onGroupPill: (id: 'all' | 'rm' | 'costa' | 'fal') => void;
  // Camión elegido en el tablero DESPACHO para previsualizar su ruta en el mapa.
  camionSeleccionado: string | null;
  camionSeleccionadoKm?: number | null;
  onSelectTruck: (patente: string | null) => void;
  onModo: (m: string) => void;
  onToggleFlota: (idx: number) => void;
  ordenActivacion?: Record<string, number>;  // [F2] orden de camiones por recencia de activación
  onToggleTlbd: (idx: number) => void;
  onAgregarVehiculo: (v: Vehiculo) => void;
  onEliminarVehiculo: (idx: number) => void;
  onActualizarVehiculo: (patente: string, updates: Partial<Vehiculo>) => void;
  onGuardarFlota: () => void;
  onManual: (t: string) => void;
  onAsignaciones: (a: Record<string, StoreAssign[]>) => void;
  onCalcular: () => void;
  onCalcularManual: () => void;
  onAsignarIA?: () => void;
  iaLoading?: boolean;
  onCerrarCamion?: (patente: string) => void;
  onLimpiar: () => void;
  onEliminarParada?: (id: string) => void;
  // Abre el Cierre de Jornada directamente desde el tablero DESPACHO, sin pasar por
  // "Calcular" — es el único lugar que manda lo que quedó sin asignar a pendientes 2ª
  // vuelta ("Listo por hoy"), y antes solo se podía llegar ahí después de calcular.
  onTerminarDia?: () => void;
  // Backlog de tiendas pendientes de 2ª vuelta de DÍAS ANTERIORES (no las de hoy) — badge
  // en el tab "2ª VUELTA" para que no pase desapercibido (antes no había ninguna señal ahí).
  pendientesBacklogCount?: number;
  rightPanelContent?: React.ReactNode;
  segundaVueltaContent?: React.ReactNode;
  // [Planificador] Reporta la ruta ordenada + partida para dibujarla en el MapSection fijo.
  onPlanRutas?: (rutas: Ruta[], cd: number[], ext?: { gps: Record<string, number[]>; tiendas: Record<string, TiendaInfo> }) => void;
  // [Layout] Mapa fijo a la DERECHA del contenido (desktop). En móvil va en el drawer del header.
  mapPanel?: React.ReactNode;
}

/* ── Icon badge for mode tabs ────────────────────────────────────── */
function TabIcon({ Icon, color }: { Icon: LIcon; color: string }) {
  return (
    <span
      style={{ background: color }}
      className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center flex-shrink-0 select-none"
    >
      <Icon size={13} color="rgba(255,255,255,0.95)" strokeWidth={2.2} />
    </span>
  );
}

// Íconos en tono navy (como el header), sobrios. Se distinguen por forma de ícono +
// estado activo, no por color. El tab MAPA se eliminó: el mapa de rutas ahora es un
// panel fijo (ver RutasScreen.tsx), siempre visible junto a este contenido.
const MODES: { id: string; Icon: LIcon; label: string; color: string }[] = [
  { id: 'drag',  Icon: Target,     label: 'DESPACHO',    color: '#1B2A6B' },
  { id: 'man',   Icon: PenLine,    label: 'MANUAL',      color: '#1B2A6B' },
  { id: 'v2',    Icon: RotateCcw,  label: '2ª VUELTA',   color: '#6B21A8' },
  { id: 'flota', Icon: Truck,      label: 'FLOTA',       color: '#1B2A6B' },
  { id: 'plan',  Icon: MapIcon,    label: 'PLAN',        color: '#0E7C6B' },
  { id: 'cal',   Icon: CalendarDays, label: 'CALENDARIO', color: '#B4690E' },
];

/* ── Main component ──────────────────────────────────────────────── */
export default function InputSection({
  flota, flotaStatus, modo, calT, manualText, errors,
  tiendas, gps, cd, manualAsignaciones,
  paradasAdicionales, grupoFiltro, grps, onGroupPill,
  camionSeleccionado, camionSeleccionadoKm, onSelectTruck,
  onModo,
  onToggleFlota, ordenActivacion, onToggleTlbd, onAgregarVehiculo, onEliminarVehiculo, onActualizarVehiculo, onGuardarFlota,
  onManual, onAsignaciones,
  onCalcular, onCalcularManual, onAsignarIA, iaLoading, onCerrarCamion, onLimpiar, onEliminarParada,
  onTerminarDia,
  pendientesBacklogCount = 0,
  rightPanelContent,
  segundaVueltaContent,
  onPlanRutas,
  mapPanel,
}: Props) {
  const [flotaSubTab, setFlotaSubTab] = useState<'personal' | 'gestionar' | 'vehiculos' | 'salidas'>('gestionar');
  const isMobile = useIsMobile();

  // Divisor arrastrable contenido ↔ mapa (desktop): % de ANCHO del mapa (a la derecha).
  const [mapPct, setMapPct] = useState<number>(() => {
    if (typeof window === 'undefined') return 37;
    const s = Number(localStorage.getItem('enrutador_map_w_pct'));
    return s >= 20 && s <= 60 ? s : 37;
  });
  const contentRowRef = useRef<HTMLDivElement>(null);
  const mapResizingRef = useRef(false);
  useEffect(() => {
    const move = (clientX: number) => {
      if (!mapResizingRef.current || !contentRowRef.current) return;
      const r = contentRowRef.current.getBoundingClientRect();
      setMapPct(Math.min(60, Math.max(20, ((r.right - clientX) / r.width) * 100)));
    };
    const onMouse = (e: MouseEvent) => move(e.clientX);
    const onTouch = (e: TouchEvent) => { if (e.touches[0]) move(e.touches[0].clientX); };
    const stop = () => {
      if (!mapResizingRef.current) return;
      mapResizingRef.current = false;
      document.body.style.cursor = ''; document.body.style.userSelect = '';
      setMapPct(p => { try { localStorage.setItem('enrutador_map_w_pct', String(Math.round(p))); } catch {} return p; });
    };
    document.addEventListener('mousemove', onMouse);
    document.addEventListener('mouseup', stop);
    document.addEventListener('touchmove', onTouch, { passive: true });
    document.addEventListener('touchend', stop);
    return () => {
      document.removeEventListener('mousemove', onMouse);
      document.removeEventListener('mouseup', stop);
      document.removeEventListener('touchmove', onTouch);
      document.removeEventListener('touchend', stop);
    };
  }, []);
  const mapDivider = mapPanel ? (
    <div
      onMouseDown={() => { mapResizingRef.current = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }}
      onTouchStart={() => { mapResizingRef.current = true; }}
      title="Arrastra para ampliar o achicar el mapa"
      className="group flex-shrink-0 cursor-col-resize flex items-center justify-center relative select-none z-10"
      style={{ width: 6, background: 'rgba(0,0,0,0.05)' }}
    >
      <div className="absolute inset-0 group-hover:bg-knavy/20 transition-colors duration-150" />
      <div className="flex flex-col gap-[4px] relative z-10 opacity-40 group-hover:opacity-100 transition-opacity duration-150">
        {[0, 1, 2].map(i => <div key={i} className="w-[4px] h-[4px] rounded-full bg-knavy" />)}
      </div>
    </div>
  ) : null;
  // Contenedor real con scroll del tablero DESPACHO — se lo pasamos a ManualDispatch para
  // el auto-scroll al arrastrar cerca del borde (más confiable que buscarlo por DOM-walk).
  const dragScrollRef = useRef<HTMLDivElement>(null);

  const errorsBanner = errors.length > 0 && (
    <div
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
      className="mx-3 mt-3 flex-shrink-0 bg-amber-50 border border-amber-200 rounded-[10px] px-3 py-2.5 text-[12px] text-amber-700 leading-relaxed"
    >
      ⚠️ {errors.join(' · ')}
    </div>
  );

  const flotaTabContent = (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sub-tab bar */}
      <div className="flex-shrink-0 flex gap-1 px-3 pt-3 pb-2 bg-white border-b border-black/[0.07]">
        <button onClick={() => setFlotaSubTab('vehiculos')}
          className={`h-[34px] px-4 rounded-[9px] text-[12px] font-bold transition-all flex items-center gap-1.5
            ${flotaSubTab === 'vehiculos' ? 'bg-knavy text-white' : 'bg-kbg text-kmuted hover:bg-black/[0.07]'}`}>
          <Truck size={13} strokeWidth={2} /><span>Vehículos</span>
        </button>
        <button onClick={() => setFlotaSubTab('personal')}
          className={`h-[34px] px-4 rounded-[9px] text-[12px] font-bold transition-all flex items-center gap-1.5
            ${flotaSubTab === 'personal' ? 'bg-knavy text-white' : 'bg-kbg text-kmuted hover:bg-black/[0.07]'}`}>
          <Users size={13} strokeWidth={2} /><span>Personal</span>
        </button>
        <button onClick={() => setFlotaSubTab('gestionar')}
          className={`h-[34px] px-4 rounded-[9px] text-[12px] font-bold transition-all flex items-center gap-1.5
            ${flotaSubTab === 'gestionar' ? 'bg-knavy text-white' : 'bg-kbg text-kmuted hover:bg-black/[0.07]'}`}>
          <ClipboardList size={13} strokeWidth={2} /><span>Gestionar</span>
        </button>
        <button onClick={() => setFlotaSubTab('salidas')}
          className={`h-[34px] px-4 rounded-[9px] text-[12px] font-bold transition-all flex items-center gap-1.5
            ${flotaSubTab === 'salidas' ? 'bg-knavy text-white' : 'bg-kbg text-kmuted hover:bg-black/[0.07]'}`}>
          <Send size={13} strokeWidth={2} /><span>Salidas</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {flotaSubTab === 'salidas' ? (
          <FlotaInternaPanel tiendas={tiendas} />
        ) : flotaSubTab === 'personal' ? (
          <PersonalCatalogPanel />
        ) : flotaSubTab === 'gestionar' ? (
          <ControlFlotaPanel />
        ) : (
          <div className="px-3 py-3">
            <FlotaGrid
              flota={flota} flotaStatus={flotaStatus}
              onToggle={onToggleFlota} onToggleTlbd={onToggleTlbd}
              onAgregarVehiculo={onAgregarVehiculo} onEliminarVehiculo={onEliminarVehiculo}
              onActualizarVehiculo={onActualizarVehiculo} onGuardarFlota={onGuardarFlota}
            />
          </div>
        )}
      </div>
    </div>
  );

  // ── Mobile: tab bar simplificada (sin badges de color), sin toggle de sidebar ──
  if (isMobile) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-shrink-0 bg-white border-b border-black/[0.09]" style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06)' }}>
          <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
            {modo === 'drag' && !rightPanelContent && onTerminarDia && (
              <button onClick={onTerminarDia} className="h-[36px] px-3 rounded-[10px] bg-white border-2 border-knavy/30 text-knavy text-[12px] font-bold flex-shrink-0 flex items-center gap-1 ml-auto">
                <Flag size={13} strokeWidth={2} aria-hidden="true" /><span>Terminar día</span>
              </button>
            )}
            <button onClick={onLimpiar} className={`h-[36px] px-3 rounded-[10px] bg-kbg border border-black/[0.10] text-kmuted text-[12px] font-semibold flex-shrink-0 ${modo === 'drag' && !rightPanelContent && onTerminarDia ? '' : 'ml-auto'}`}>
              Limpiar
            </button>
            <div className="flex bg-kbg rounded-[10px] p-[3px] gap-1 w-full">
              {MODES.map(({ id, Icon, label }) => (
                <button key={id} onClick={() => onModo(id)}
                  aria-label={id === 'v2' && pendientesBacklogCount > 0 ? `${label} — ${pendientesBacklogCount} pendiente${pendientesBacklogCount !== 1 ? 's' : ''} de días anteriores` : label}
                  title={label}
                  className={`relative flex-1 h-[36px] rounded-[8px] flex items-center justify-center transition-all
                    ${modo === id ? 'bg-white shadow-sm text-ktext' : 'text-kmuted'}`}>
                  <Icon size={16} strokeWidth={2} aria-hidden="true" />
                  {id === 'v2' && pendientesBacklogCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-[3px] rounded-full bg-kred text-white text-[9px] font-bold flex items-center justify-center leading-none" aria-hidden="true">
                      {pendientesBacklogCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
        {errorsBanner}
        {modo === 'flota' ? flotaTabContent
        : modo === 'v2' ? (
          <div className="flex-1 overflow-hidden">{segundaVueltaContent}</div>
        ) : modo === 'cal' ? (
          <div className="flex-1 overflow-y-auto p-3 bg-kbg"><CalendarioColumnas readOnly forceGeneral /></div>
        ) : modo === 'plan' ? (
          <div className="flex-1 overflow-hidden bg-white"><PlanificadorTab gps={gps} tiendas={tiendas} onPlanRutas={onPlanRutas} /></div>
        ) : rightPanelContent ? (
          <div className="flex-1 overflow-hidden">{rightPanelContent}</div>
        ) : (
          <div ref={dragScrollRef} className="flex-1 overflow-y-auto bg-kbg">
            {modo === 'drag' && (
              <div className="p-3">
                <ManualDispatch calT={calT} flota={flota} gps={gps} tiendas={tiendas} cd={cd}
                  paradas={paradasAdicionales} asignaciones={manualAsignaciones} onAsignaciones={onAsignaciones}
                  onCalcular={onCalcularManual} onEliminarParada={onEliminarParada}
                  grupoFiltro={grupoFiltro} grps={grps} onGroupPill={onGroupPill}
                  camionSeleccionado={camionSeleccionado} camionSeleccionadoKm={camionSeleccionadoKm} onSelectTruck={onSelectTruck}
                  scrollContainerRef={dragScrollRef}
                  onAsignarIA={onAsignarIA} iaLoading={iaLoading} onToggleFlota={onToggleFlota} ordenActivacion={ordenActivacion} onCerrarCamion={onCerrarCamion} />
              </div>
            )}
            {modo === 'man' && (
              <div className="p-4">
                <ManualMode value={manualText} onChange={onManual} calT={calT} modo={modo} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Desktop ──
  return (
    <div className="flex flex-col h-full overflow-hidden bg-kbg">

      {/* Mode tab bar — SIEMPRE visible */}
      <div className="flex-shrink-0 bg-white border-b border-black/[0.09]" style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06)' }}>
        <div className="flex items-center gap-2 px-4 py-2.5">
          <div className="flex bg-kbg rounded-[12px] p-[4px] gap-1">
            {MODES.map(({ id, Icon, label, color }) => (
              <button
                key={id}
                onClick={() => { if (!rightPanelContent || id === 'flota' || id === 'v2' || id === 'cal' || id === 'plan') onModo(id); }}
                style={modo === id ? { background: 'white', boxShadow: '0 1px 5px rgba(0,0,0,0.10)' } : undefined}
                className={`relative h-[40px] px-3.5 rounded-[10px] flex items-center gap-2 transition-all
                  ${rightPanelContent && id !== 'flota' && id !== 'v2' && id !== 'cal' && id !== 'plan' ? 'opacity-40 cursor-default' : modo === id ? '' : 'hover:bg-white/60'}`}
              >
                <TabIcon Icon={Icon} color={color} />
                <span className={`text-[11px] font-extrabold tracking-[0.06em] transition-colors
                  ${modo === id ? 'text-ktext' : 'text-kmuted'}`}>
                  {label}
                </span>
                {id === 'v2' && pendientesBacklogCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-[4px] rounded-full bg-kred text-white text-[10px] font-bold flex items-center justify-center leading-none" aria-hidden="true">
                    {pendientesBacklogCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          {!rightPanelContent && modo === 'drag' && onTerminarDia && (
            <button
              onClick={onTerminarDia}
              className="h-[40px] px-4 rounded-[12px] bg-white border-2 border-knavy/30 text-knavy text-[13px] font-bold hover:border-knavy transition-all flex items-center gap-2"
            >
              <Flag size={15} strokeWidth={2} /><span>Terminar día</span>
            </button>
          )}
          {!rightPanelContent && modo !== 'drag' && modo !== 'flota' && modo !== 'cal' && modo !== 'plan' && (
            <button
              onClick={onCalcular}
              className="h-[40px] px-6 rounded-[12px] bg-knavy text-white text-[14px] font-bold transition-all active:scale-[0.97] hover:bg-knavy/90 flex items-center gap-2"
            >
              <Truck size={15} strokeWidth={2} /><span>Calcular Rutas</span>
            </button>
          )}
          {modo !== 'flota' && modo !== 'cal' && modo !== 'plan' && (
            <button
              onClick={onLimpiar}
              className="h-[40px] px-4 rounded-[12px] bg-kbg border border-black/[0.10] text-kmuted text-[13px] font-semibold hover:text-ktext hover:border-black/[0.18] transition-all"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {errorsBanner}

      {/* Content area — contenido (izquierda) + mapa fijo (derecha, desktop) */}
      <div ref={contentRowRef} className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex flex-col overflow-hidden min-w-0" style={mapPanel ? { flex: `1 1 ${100 - mapPct}%` } : { flex: '1 1 100%' }}>
      {modo === 'flota' ? flotaTabContent
      : modo === 'v2' ? (
        <div className="flex-1 overflow-hidden">
          {segundaVueltaContent}
        </div>
      ) : modo === 'cal' ? (
        <div className="flex-1 overflow-y-auto p-4">
          <CalendarioColumnas readOnly forceGeneral />
        </div>
      ) : modo === 'plan' ? (
        <div className="flex-1 overflow-hidden bg-white">
          <PlanificadorTab gps={gps} tiendas={tiendas} onPlanRutas={onPlanRutas} />
        </div>
      ) : rightPanelContent ? (
        <div className="flex-1 overflow-hidden">
          {rightPanelContent}
        </div>
      ) : (
        <div ref={dragScrollRef} className="flex-1 overflow-y-auto">

          {/* DESPACHO MODE */}
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
                onEliminarParada={onEliminarParada}
                grupoFiltro={grupoFiltro}
                grps={grps}
                onGroupPill={onGroupPill}
                camionSeleccionado={camionSeleccionado}
                camionSeleccionadoKm={camionSeleccionadoKm}
                onSelectTruck={onSelectTruck}
                scrollContainerRef={dragScrollRef}
                onAsignarIA={onAsignarIA}
                iaLoading={iaLoading}
                onToggleFlota={onToggleFlota}
                ordenActivacion={ordenActivacion}
                onCerrarCamion={onCerrarCamion}
              />
            </div>
          )}

          {/* MANUAL MODE */}
          {modo === 'man' && (
            <div className="p-6 max-w-[680px]">
              <div className="text-[11px] font-semibold text-kmuted uppercase tracking-wider mb-3">Ingreso manual</div>
              <ManualMode value={manualText} onChange={onManual} calT={calT} modo={modo} />
            </div>
          )}
        </div>
      )}
        </div>
        {mapDivider}
        {mapPanel && (
          <div className="flex-shrink-0 overflow-hidden border-l border-black/[0.09]" style={{ flex: `0 0 ${mapPct}%`, minWidth: 0 }}>
            {mapPanel}
          </div>
        )}
      </div>
    </div>
  );
}
