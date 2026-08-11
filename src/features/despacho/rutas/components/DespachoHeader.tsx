'use client';
import { getDia, todayStr } from '../utils/helpers';

interface CalData { on: boolean; p: number; b: number; }

interface Props {
  supervisor: string;
  onSupervisor: (s: string) => void;
  fecha: string;
  onFecha: (f: string) => void;
  onOpenParadas: () => void;
  paradasCount: number;
  dnom: Record<string, string>;
  calT: Record<string, CalData>;
  grps: Set<string>;
  onToggleGroup: (gid: string) => void;
  grupoFiltro: 'all' | 'rm' | 'costa' | 'fal';
  onGrupoFiltro: (f: 'all' | 'rm' | 'costa' | 'fal') => void;
}

/* ── Unified group filter pill — filtra el pool "Sin asignar" del board DESPACHO ── */
function GroupPill({ label, active, selected, onClick }: { label: string; active: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-[30px] px-3 rounded-[8px] text-[11px] font-bold transition-all border
        ${selected
          ? 'bg-knavy text-white border-knavy'
          : active
            ? 'bg-white border-knavy/40 text-knavy/70 hover:border-knavy hover:text-knavy'
            : 'bg-white border-black/[0.10] text-kmuted/50 hover:border-black/[0.20] hover:text-kmuted'}`}
    >
      {label}
    </button>
  );
}

/* ── Barra global del Enrutador — supervisor, fecha de salida, paradas extra y filtro
     de grupo. Antes vivía repartido en un panel izquierdo angosto y arrastrable; ahora
     es una franja fija de ancho completo, siempre visible sobre el tablero. ── */
export default function DespachoHeader({
  supervisor, onSupervisor, fecha, onFecha, onOpenParadas, paradasCount,
  dnom, calT, grps, onToggleGroup, grupoFiltro, onGrupoFiltro,
}: Props) {
  const dia         = getDia(fecha);
  const hoy         = todayStr();
  const totalStores = Object.keys(calT).length;
  const activeCount = Object.values(calT).filter(d => d.on && (d.p > 0 || d.b > 0)).length;
  const manana = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();

  function handleGroupPill(id: 'all' | 'rm' | 'costa' | 'fal') {
    if (id === 'all') { onGrupoFiltro('all'); return; }
    if (!grps.has(id)) {
      onToggleGroup(id);
      onGrupoFiltro(id);
    } else if (grupoFiltro === id) {
      onToggleGroup(id);
      onGrupoFiltro('all');
    } else {
      onGrupoFiltro(id);
    }
  }

  return (
    <div className="flex-shrink-0 bg-white border-b border-black/[0.09]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">

        {/* Supervisor */}
        <input
          type="text"
          value={supervisor}
          onChange={e => onSupervisor(e.target.value)}
          placeholder="Supervisor"
          className="h-[38px] w-[170px] px-3 bg-kbg border-[1.5px] border-black/[0.09] rounded-[10px] text-[13px] font-semibold text-ktext focus:border-knavy focus:outline-none transition-colors placeholder:text-kmuted/50"
        />

        {/* Fecha de salida */}
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => onFecha(hoy)}
            className={`h-[38px] text-[11px] font-bold px-2.5 rounded-[7px] transition-colors ${fecha === hoy ? 'bg-knavy text-white' : 'bg-kbg text-kmuted border border-black/[0.1] hover:bg-black/[0.04]'}`}>
            Hoy
          </button>
          <button type="button" onClick={() => onFecha(manana)}
            className={`h-[38px] text-[11px] font-bold px-2.5 rounded-[7px] transition-colors ${fecha === manana ? 'bg-knavy text-white' : 'bg-kbg text-kmuted border border-black/[0.1] hover:bg-black/[0.04]'}`}>
            Mañana
          </button>
          <input
            type="date"
            value={fecha}
            onChange={e => onFecha(e.target.value)}
            className="h-[38px] px-2.5 rounded-[10px] bg-kbg border-[1.5px] border-black/[0.09] text-[13px] font-semibold text-ktext focus:border-knavy focus:outline-none transition-colors"
          />
        </div>

        {/* Resumen del día */}
        <div className="text-[12px] text-kmuted whitespace-nowrap">
          <span className="font-semibold text-ktext">{dnom[dia] || 'Hoy'}</span> · {totalStores} tiendas · {activeCount > 0 ? `${activeCount} con carga` : 'sin carga asignada'}
        </div>

        <div className="flex-1 min-w-[8px]" />

        {/* Filtro de grupo */}
        <div className="flex items-center gap-1.5">
          <GroupPill label="Todas"    active={grps.size > 0}     selected={grupoFiltro === 'all'}   onClick={() => handleGroupPill('all')} />
          <GroupPill label="RM"       active={grps.has('rm')}    selected={grupoFiltro === 'rm'}    onClick={() => handleGroupPill('rm')} />
          <GroupPill label="COSTA"    active={grps.has('costa')} selected={grupoFiltro === 'costa'} onClick={() => handleGroupPill('costa')} />
          <GroupPill label="REGIONES" active={grps.has('fal')}   selected={grupoFiltro === 'fal'}   onClick={() => handleGroupPill('fal')} />
        </div>

        {/* + Parada */}
        <button
          onClick={onOpenParadas}
          className="flex items-center gap-1.5 h-[38px] px-3 rounded-[10px] bg-knavy text-white text-[12px] font-bold hover:bg-knavy/90 active:scale-95 transition-all"
        >
          <span className="text-[16px] leading-none">+</span>
          <span>Parada</span>
          {paradasCount > 0 && (
            <span className="bg-white/30 text-white text-[9px] font-extrabold w-[16px] h-[16px] rounded-full flex items-center justify-center">
              {paradasCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
