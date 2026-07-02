'use client';
import { useState, useEffect, useRef } from 'react';
import { Target, Calculator, PenLine, Truck, Users, ClipboardList, RotateCcw } from 'lucide-react';
type LIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
import ManualMode     from './ManualMode';
import ManualDispatch from './ManualDispatch';
import FlotaGrid      from './FlotaGrid';
import { ControlFlotaPanel, PersonalCatalogPanel } from '@/features/despacho/control-flota/ControlFlotaPanel';
import { getDia, formatCod, todayStr } from '../utils/helpers';
import type { Vehiculo } from '../data/flota';
import type { TiendaInfo } from '../data/tiendas';
import type { Parada } from './ParadasAdicionales';

interface CalData { on: boolean; p: number; b: number; c: number; ch: number; g?: string; }
interface StoreAssign { c: string; p: number; b: number; }

interface Props {
  flota: Vehiculo[];
  conductores: string[];
  flotaStatus?: string;
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
  onPionetaChange: (idx: number, field: 'p1' | 'p2', value: string) => void;
  onAgregarConductor: (nombre: string) => void;
  onToggleFlota: (idx: number) => void;
  onToggleTlbd: (idx: number) => void;
  onAgregarVehiculo: (v: Vehiculo) => void;
  onEliminarVehiculo: (idx: number) => void;
  onActualizarVehiculo: (patente: string, updates: Partial<Vehiculo>) => void;
  onGuardarFlota: () => void;
  onSupervisor: (s: string) => void;
  onFecha: (f: string) => void;
  onManual: (t: string) => void;
  onAsignaciones: (a: Record<string, StoreAssign[]>) => void;
  onCalcular: () => void;
  onCalcularManual: () => void;
  onLimpiar: () => void;
  onEliminarParada?: (id: string) => void;
  rightPanelContent?: React.ReactNode;
  segundaVueltaContent?: React.ReactNode;
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

/* ── Icon badge for mode tabs ────────────────────────────────────── */
function TabIcon({ Icon, from, to, shadow }: { Icon: LIcon; from: string; to: string; shadow: string }) {
  return (
    <span
      style={{
        background: `linear-gradient(145deg, ${from}, ${to})`,
        boxShadow: `0 2px 6px ${shadow}, inset 0 1px 0 rgba(255,255,255,0.12)`,
      }}
      className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center flex-shrink-0 select-none"
    >
      <Icon size={13} color="rgba(255,255,255,0.95)" strokeWidth={2.2} />
    </span>
  );
}

// Íconos en tono navy (como el header), sobrios. Se distinguen por forma de ícono +
// estado activo, no por color.
const MODES: { id: string; Icon: LIcon; label: string; from: string; to: string; shadow: string }[] = [
  { id: 'drag',  Icon: Target,     label: 'DESPACHO', from: '#3D52CC', to: '#1B2A6B', shadow: 'rgba(27,42,107,0.30)' },
  { id: 'cal',   Icon: Calculator, label: 'CALCULAR', from: '#3D52CC', to: '#1B2A6B', shadow: 'rgba(27,42,107,0.30)' },
  { id: 'man',   Icon: PenLine,    label: 'MANUAL',   from: '#3D52CC', to: '#1B2A6B', shadow: 'rgba(27,42,107,0.30)' },
  { id: 'v2',    Icon: RotateCcw,  label: '2ª VUELTA', from: '#6B21A8', to: '#4C1D95', shadow: 'rgba(76,29,149,0.30)' },
  { id: 'flota', Icon: Truck,      label: 'FLOTA',    from: '#3D52CC', to: '#1B2A6B', shadow: 'rgba(27,42,107,0.30)' },
];

/* ── Unified group filter pill ───────────────────────────────────── */
function GroupPill({ id, label, active, selected, onClick }: { id: string; label: string; active: boolean; selected: boolean; onClick: () => void }) {
  const isAll = id === 'all';
  return (
    <button
      onClick={onClick}
      style={selected ? { boxShadow: isAll ? '0 2px 8px rgba(27,42,107,0.22)' : '0 2px 8px rgba(212,43,43,0.20)' } : undefined}
      className={`flex-1 h-[28px] rounded-[8px] text-[11px] font-bold transition-all border
        ${selected
          ? isAll
            ? 'bg-knavy text-white border-knavy'
            : 'bg-kred text-white border-kred'
          : active
            ? isAll
              ? 'bg-white border-knavy/40 text-knavy/70 hover:border-knavy hover:text-knavy'
              : 'bg-white border-kred/30 text-kred/70 hover:border-kred hover:text-kred'
            : 'bg-white border-black/[0.10] text-kmuted/50 hover:border-black/[0.20] hover:text-kmuted'}`}
    >
      {label}
    </button>
  );
}

/* ── Main component ──────────────────────────────────────────────── */
export default function InputSection({
  flota, conductores, flotaStatus, modo, grps, calT, supervisor, fecha, manualText, errors,
  dnom, tiendas, gps, cd, manualAsignaciones,
  paradasAdicionales, onOpenParadas,
  onModo, onToggleGroup, onToggleChip, onUpdateChip,
  onConductorChange, onPionetaChange, onAgregarConductor,
  onToggleFlota, onToggleTlbd, onAgregarVehiculo, onEliminarVehiculo, onActualizarVehiculo, onGuardarFlota,
  onSupervisor, onFecha, onManual, onAsignaciones,
  onCalcular, onCalcularManual, onLimpiar, onEliminarParada,
  rightPanelContent,
  segundaVueltaContent,
}: Props) {
  const dia = getDia(fecha);
  // Fecha de SALIDA: por defecto hoy, pero se arma a veces para mañana (sale al día
  // siguiente). Atajos Hoy/Mañana para que la 2ª vuelta quede bajo la fecha correcta.
  const hoy = todayStr();
  const manana = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const [sidebarFilter, setSidebarFilter] = useState<'all' | 'rm' | 'costa' | 'fal'>('all');
  const [flotaSubTab, setFlotaSubTab]     = useState<'personal' | 'gestionar' | 'vehiculos'>('gestionar');

  /* ── Resizable sidebar ── */
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 300;
    return Number(localStorage.getItem('enrutador_sidebar_width') ?? '300');
  });
  const [isDesktop, setIsDesktop] = useState(false);
  const [isMobile,  setIsMobile]  = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'sidebar' | 'right'>('sidebar');
  const isResizingRef     = useRef(false);
  const dragStartXRef     = useRef(0);
  const dragStartWidthRef = useRef(0);

  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024);
      setIsMobile(window.innerWidth < 768);
    };
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

  function handleGroupPill(id: 'all' | 'rm' | 'costa' | 'fal') {
    if (id === 'all') { setSidebarFilter('all'); return; }
    if (!grps.has(id)) {
      onToggleGroup(id);
      setSidebarFilter(id);
    } else if (sidebarFilter === id) {
      onToggleGroup(id);
      setSidebarFilter('all');
    } else {
      setSidebarFilter(id);
    }
  }
  const totalStores = Object.keys(calT).length;

  const sidebarStyle = isDesktop ? { width: leftWidth, flexShrink: 0 } : undefined;
  const sidebarClass = isDesktop ? '' : 'w-[260px] md:w-[290px]';

  // En mobile mostramos solo un panel a la vez
  if (isMobile) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {mobilePanel === 'sidebar' ? (
          <>
            {/* Sidebar stores — mobile full width */}
            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              {/* Header + Paradas */}
              <div className="px-4 py-3 border-b border-black/[0.08] flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-kmuted uppercase tracking-wider mb-0.5 truncate">
                    {dnom[getDia(fecha)] || 'Hoy'} · {totalStores} tiendas
                  </div>
                  <div className="text-[15px] font-bold text-ktext leading-tight">
                    {activeCount > 0 ? `${activeCount} con carga` : 'Sin carga asignada'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onOpenParadas}
                    style={{ boxShadow: '0 1px 4px rgba(27,42,107,0.18)' }}
                    className="flex items-center gap-1.5 h-[32px] px-3 rounded-[10px] bg-knavy text-white text-[12px] font-bold"
                  >
                    <span className="text-[16px] leading-none">+</span>
                    <span>Parada</span>
                    {paradasAdicionales.length > 0 && (
                      <span className="bg-white/30 text-[9px] font-extrabold w-[16px] h-[16px] rounded-full flex items-center justify-center">
                        {paradasAdicionales.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setMobilePanel('right')}
                    className="h-[32px] px-3 rounded-[10px] bg-knavy text-white text-[12px] font-bold flex items-center gap-1"
                  >
                    Rutas →
                  </button>
                </div>
              </div>
              {/* Supervisor + Date */}
              <div className="px-4 pt-3 pb-2 border-b border-black/[0.08] space-y-2">
                <input type="text" value={supervisor} onChange={e => onSupervisor(e.target.value)} placeholder="Supervisor"
                  className="w-full h-[38px] px-3 bg-kbg border-[1.5px] border-black/[0.09] rounded-[10px] text-[14px] font-semibold text-ktext focus:border-kred focus:outline-none" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-kmuted">Fecha de salida</span>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => onFecha(hoy)}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-[7px] transition-colors ${fecha === hoy ? 'bg-knavy text-white' : 'bg-kbg text-kmuted border border-black/[0.1] hover:bg-black/[0.04]'}`}>
                      Hoy
                    </button>
                    <button type="button" onClick={() => onFecha(manana)}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-[7px] transition-colors ${fecha === manana ? 'bg-kred text-white' : 'bg-kbg text-kmuted border border-black/[0.1] hover:bg-black/[0.04]'}`}>
                      Mañana
                    </button>
                  </div>
                </div>
                <input type="date" value={fecha} onChange={e => onFecha(e.target.value)}
                  className="w-full h-[36px] px-3 rounded-[10px] bg-kbg border-[1.5px] border-black/[0.09] text-[13px] font-semibold text-ktext focus:border-kred focus:outline-none" />
              </div>
              {/* Unified group filter */}
              <div className="px-3 pt-2 pb-1 flex gap-1.5">
                <GroupPill id="all"   label="Todas"    active={grps.size > 0}     selected={sidebarFilter === 'all'}   onClick={() => handleGroupPill('all')} />
                <GroupPill id="rm"    label="RM"       active={grps.has('rm')}    selected={sidebarFilter === 'rm'}    onClick={() => handleGroupPill('rm')} />
                <GroupPill id="costa" label="COSTA"    active={grps.has('costa')} selected={sidebarFilter === 'costa'} onClick={() => handleGroupPill('costa')} />
                <GroupPill id="fal"   label="REGIONES" active={grps.has('fal')}   selected={sidebarFilter === 'fal'}   onClick={() => handleGroupPill('fal')} />
              </div>
              {/* Store list */}
              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-[5px]">
                {Object.entries(filteredCalT).map(([cod, data]) => (
                  <SidebarRow key={cod} cod={cod} data={data} onToggle={onToggleChip} onUpdate={onUpdateChip} />
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Right panel — mobile full width */}
            <div className="flex-shrink-0 bg-white border-b border-black/[0.09]" style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06)' }}>
              <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
                <button onClick={() => setMobilePanel('sidebar')}
                  className="h-[36px] px-3 rounded-[10px] bg-kbg border border-black/[0.10] text-kmuted text-[12px] font-semibold flex-shrink-0">
                  ← Tiendas
                </button>
                <button onClick={onLimpiar} className="h-[36px] px-3 rounded-[10px] bg-kbg border border-black/[0.10] text-kmuted text-[12px] font-semibold flex-shrink-0 ml-auto">
                  Limpiar
                </button>
                {/* Modos: fila propia a lo ancho para que no queden apretados en móvil */}
                <div className="flex bg-kbg rounded-[10px] p-[3px] gap-1 w-full">
                  {MODES.map(({ id, Icon, label }) => (
                    <button key={id} onClick={() => onModo(id)}
                      className={`flex-1 h-[36px] rounded-[8px] text-[11px] font-extrabold flex items-center justify-center gap-1 transition-all
                        ${modo === id ? 'bg-white shadow-sm text-ktext' : 'text-kmuted'}`}>
                      <Icon size={13} strokeWidth={2} /><span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden bg-kbg">
              {modo === 'flota' ? (
                <div className="h-full flex flex-col overflow-hidden">
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
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {flotaSubTab === 'personal' ? (
                      <PersonalCatalogPanel />
                    ) : flotaSubTab === 'gestionar' ? (
                      <ControlFlotaPanel />
                    ) : (
                      <div className="px-3 py-3">
                        <FlotaGrid
                          flota={flota} conductores={conductores} flotaStatus={flotaStatus}
                          onToggle={onToggleFlota} onToggleTlbd={onToggleTlbd}
                          onConductorChange={onConductorChange} onPionetaChange={onPionetaChange}
                          onAgregarConductor={onAgregarConductor}
                          onAgregarVehiculo={onAgregarVehiculo} onEliminarVehiculo={onEliminarVehiculo}
                          onActualizarVehiculo={onActualizarVehiculo} onGuardarFlota={onGuardarFlota}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : modo === 'v2' ? (
                <div className="h-full overflow-hidden">{segundaVueltaContent}</div>
              ) : rightPanelContent ? (
                <div className="h-full overflow-hidden">{rightPanelContent}</div>
              ) : (
                <div className="h-full overflow-y-auto">
                  {modo === 'drag' && (
                    <div className="p-3">
                      <ManualDispatch calT={calT} flota={flota} gps={gps} tiendas={tiendas} cd={cd}
                        paradas={paradasAdicionales} asignaciones={manualAsignaciones} onAsignaciones={onAsignaciones}
                        onCalcular={onCalcularManual} onEliminarParada={onEliminarParada} />
                    </div>
                  )}
                  {modo === 'cal' && (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                      <div style={{ background: 'linear-gradient(145deg,#1B2A6B,#2D3FA0)', boxShadow: '0 8px 32px rgba(27,42,107,0.12)' }}
                        className="w-[60px] h-[60px] rounded-[18px] flex items-center justify-center mb-5">
                        <Calculator size={26} color="rgba(255,255,255,0.9)" strokeWidth={1.8} />
                      </div>
                      <div className="text-[20px] font-bold text-ktext mb-2">Calcular rutas</div>
                      <div className="text-[13px] text-kmuted mb-8 max-w-xs leading-relaxed">Configura tiendas y cantidades en el panel izquierdo.</div>
                      <button onClick={onCalcular} style={{ boxShadow: '0 6px 20px rgba(212,43,43,0.32)' }}
                        className="h-[52px] px-10 rounded-[14px] bg-kred text-white text-[16px] font-bold transition-all active:scale-[0.97] flex items-center gap-2">
                        <Truck size={16} strokeWidth={2} /> Calcular Rutas
                      </button>
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
          </>
        )}
      </div>
    );
  }

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
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-kmuted">Fecha de salida</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => onFecha(hoy)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-[7px] transition-colors ${fecha === hoy ? 'bg-knavy text-white' : 'bg-kbg text-kmuted border border-black/[0.1] hover:bg-black/[0.04]'}`}>
                  Hoy
                </button>
                <button type="button" onClick={() => onFecha(manana)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-[7px] transition-colors ${fecha === manana ? 'bg-kred text-white' : 'bg-kbg text-kmuted border border-black/[0.1] hover:bg-black/[0.04]'}`}>
                  Mañana
                </button>
              </div>
            </div>
            <input
              type="date"
              value={fecha}
              onChange={e => onFecha(e.target.value)}
              className="w-full h-[40px] px-3 rounded-[10px] bg-kbg border-[1.5px] border-black/[0.09] text-[14px] font-semibold text-ktext focus:border-kred focus:outline-none transition-colors"
            />
          </div>
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
            style={{ boxShadow: '0 1px 4px rgba(27,42,107,0.18)' }}
            className="flex-shrink-0 flex items-center gap-1.5 h-[32px] px-3 rounded-[10px] bg-knavy text-white text-[12px] font-bold hover:bg-knavy/90 active:scale-95 transition-all"
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

        {/* Unified group filter */}
        <div className="px-3 pt-3 pb-2">
          <div className="text-[10px] font-semibold text-kmuted/70 uppercase tracking-wider mb-2">Grupos activos</div>
          <div className="flex gap-1.5">
            <GroupPill id="all"   label="Todas"    active={grps.size > 0}     selected={sidebarFilter === 'all'}   onClick={() => handleGroupPill('all')} />
            <GroupPill id="rm"    label="RM"       active={grps.has('rm')}    selected={sidebarFilter === 'rm'}    onClick={() => handleGroupPill('rm')} />
            <GroupPill id="costa" label="COSTA"    active={grps.has('costa')} selected={sidebarFilter === 'costa'} onClick={() => handleGroupPill('costa')} />
            <GroupPill id="fal"   label="REGIONES" active={grps.has('fal')}   selected={sidebarFilter === 'fal'}   onClick={() => handleGroupPill('fal')} />
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

        {/* ── Mode tab bar — SIEMPRE visible ── */}
        <div className="flex-shrink-0 bg-white border-b border-black/[0.09]" style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.06)' }}>
          <div className="flex items-center gap-2 px-4 py-2.5">
            <div className="flex bg-kbg rounded-[12px] p-[4px] gap-1">
              {MODES.map(({ id, Icon, label, from, to, shadow }) => (
                <button
                  key={id}
                  onClick={() => { if (!rightPanelContent || id === 'flota' || id === 'v2') onModo(id); }}
                  style={modo === id ? { background: 'white', boxShadow: '0 1px 5px rgba(0,0,0,0.10)' } : undefined}
                  className={`h-[40px] px-3.5 rounded-[10px] flex items-center gap-2 transition-all
                    ${rightPanelContent && id !== 'flota' && id !== 'v2' ? 'opacity-40 cursor-default' : modo === id ? '' : 'hover:bg-white/60'}`}
                >
                  <TabIcon Icon={Icon} from={from} to={to} shadow={shadow} />
                  <span className={`text-[11px] font-extrabold tracking-[0.06em] transition-colors
                    ${modo === id ? 'text-ktext' : 'text-kmuted'}`}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex-1" />
            {!rightPanelContent && modo !== 'drag' && modo !== 'flota' && (
              <button
                onClick={onCalcular}
                style={{ boxShadow: '0 3px 12px rgba(212,43,43,0.28)' }}
                className="h-[40px] px-6 rounded-[12px] bg-kred text-white text-[14px] font-bold transition-all active:scale-[0.97] hover:bg-kred/90 flex items-center gap-2"
              >
                <Truck size={15} strokeWidth={2} /><span>Calcular Rutas</span>
              </button>
            )}
            {modo !== 'flota' && (
              <button
                onClick={onLimpiar}
                className="h-[40px] px-4 rounded-[12px] bg-kbg border border-black/[0.10] text-kmuted text-[13px] font-semibold hover:text-ktext hover:border-black/[0.18] transition-all"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* ── Content area ── */}
        {modo === 'flota' ? (
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
            </div>
            <div className="flex-1 overflow-y-auto">
              {flotaSubTab === 'personal' ? (
                <PersonalCatalogPanel />
              ) : flotaSubTab === 'gestionar' ? (
                <ControlFlotaPanel />
              ) : (
                <div className="px-3 py-3">
                  <FlotaGrid
                    flota={flota} conductores={conductores} flotaStatus={flotaStatus}
                    onToggle={onToggleFlota} onToggleTlbd={onToggleTlbd}
                    onConductorChange={onConductorChange} onPionetaChange={onPionetaChange}
                    onAgregarConductor={onAgregarConductor}
                    onAgregarVehiculo={onAgregarVehiculo} onEliminarVehiculo={onEliminarVehiculo}
                    onActualizarVehiculo={onActualizarVehiculo} onGuardarFlota={onGuardarFlota}
                  />
                </div>
              )}
            </div>
          </div>
        ) : modo === 'v2' ? (
          <div className="flex-1 overflow-hidden">
            {segundaVueltaContent}
          </div>
        ) : rightPanelContent ? (
          <div className="flex-1 overflow-hidden">
            {rightPanelContent}
          </div>
        ) : (
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
                    onEliminarParada={onEliminarParada}
                  />
                </div>
              )}

              {/* 🚛 CALCULAR MODE */}
              {modo === 'cal' && (
                <div className="flex flex-col items-center justify-center h-full p-10 text-center">
                  <div
                    style={{ boxShadow: '0 8px 32px rgba(27,42,107,0.12)', background: 'linear-gradient(145deg, #1B2A6B, #2D3FA0)' }}
                    className="w-[72px] h-[72px] rounded-[20px] flex items-center justify-center mb-6"
                  >
                    <Calculator size={32} color="rgba(255,255,255,0.9)" strokeWidth={1.8} />
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
                    <Truck size={18} strokeWidth={2} /><span>Calcular Rutas</span>
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
          )}
      </div>
    </div>
  );
}
