'use client';
import { useEffect, useState } from 'react';
import { Menu, X, RefreshCw } from 'lucide-react';
import { getDia, todayStr } from '../utils/helpers';
import { useIsMobile } from '../utils/useIsMobile';

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
  /** Mapa persistente — en desktop RutasScreen lo monta aparte, en mobile se monta acá
   *  adentro del drawer (nunca las dos instancias a la vez). */
  mapContent?: React.ReactNode;
}

/** Botón "Actualizar datos" — antes vivía en la barra azul de app/despacho/page.tsx.
 *  Se comunica con RutasScreen por eventos: dispara `enrutador-refresh` y escucha
 *  `enrutador-status` para reflejar loading/success/error + total de tiendas. */
function RefreshButton({ compact }: { compact?: boolean }) {
  const [status, setStatus] = useState<{ status: string; total: number }>({ status: 'idle', total: 0 });
  useEffect(() => {
    const h = (e: Event) => setStatus((e as CustomEvent).detail);
    window.addEventListener('enrutador-status', h);
    return () => window.removeEventListener('enrutador-status', h);
  }, []);
  const label = status.status === 'loading' ? 'Actualizando…'
    : status.status === 'error'   ? 'Error — reintentar'
    : status.status === 'success' ? `${status.total} tiendas · OK`
    : status.total > 0            ? `${status.total} tiendas`
    : 'Actualizar';
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent('enrutador-refresh'))}
      disabled={status.status === 'loading'}
      className={`flex items-center gap-1.5 h-[38px] rounded-[10px] flex-shrink-0 transition-all active:scale-95 disabled:opacity-60 bg-kbg border border-black/[0.10] text-kmuted hover:text-ktext hover:border-black/[0.18] ${compact ? 'w-[38px] justify-center' : 'px-3'}`}
      aria-label="Actualizar datos"
      title="Vuelve a descargar Tiendas, Flota y Calendario desde Google Sheets"
    >
      <RefreshCw size={14} className={status.status === 'loading' ? 'animate-spin' : ''} aria-hidden="true" />
      {!compact && <span className="text-[11px] font-bold">{label}</span>}
    </button>
  );
}

/* ── Contenido compartido desktop/drawer: supervisor, fecha (el filtro de grupo se movió a la
     fila "Sin asignar" del board, en ManualDispatch) ── */
function HeaderFields({
  supervisor, onSupervisor, fecha, onFecha, hoy, manana, stacked,
}: {
  supervisor: string; onSupervisor: (s: string) => void;
  fecha: string; onFecha: (f: string) => void;
  hoy: string; manana: string;
  stacked?: boolean;
}) {
  return (
    <>
      <div className={stacked ? 'w-full' : ''}>
        {stacked && <div className="text-[10px] font-bold uppercase tracking-wide text-kmuted mb-1">Supervisor</div>}
        <input
          type="text"
          value={supervisor}
          onChange={e => onSupervisor(e.target.value)}
          placeholder="Supervisor"
          className={`h-[38px] px-3 bg-kbg border-[1.5px] border-black/[0.09] rounded-[10px] text-[13px] font-semibold text-ktext focus:border-knavy focus:outline-none transition-colors placeholder:text-kmuted/50 ${stacked ? 'w-full' : 'w-[170px]'}`}
        />
      </div>

      <div className={stacked ? 'w-full' : ''}>
        {stacked && <div className="text-[10px] font-bold uppercase tracking-wide text-kmuted mb-1">Fecha de salida</div>}
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
            className={`h-[38px] px-2.5 rounded-[10px] bg-kbg border-[1.5px] border-black/[0.09] text-[13px] font-semibold text-ktext focus:border-knavy focus:outline-none transition-colors ${stacked ? 'flex-1 min-w-0' : ''}`}
          />
        </div>
      </div>
    </>
  );
}

/* ── Barra global del Enrutador — supervisor, fecha de salida, paradas extra y filtro
     de grupo. En desktop es una franja de ancho completo siempre visible; en mobile se
     colapsa a una fila angosta con un ícono hamburguesa que abre un drawer con todo
     (incluido el mapa, ver `mapContent`). ── */
export default function DespachoHeader({
  supervisor, onSupervisor, fecha, onFecha, onOpenParadas, paradasCount,
  dnom, calT, mapContent,
}: Props) {
  const dia         = getDia(fecha);
  const hoy         = todayStr();
  const totalStores = Object.keys(calT).length;
  const activeCount = Object.values(calT).filter(d => d.on && (d.p > 0 || d.b > 0)).length;
  const manana = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (isMobile) {
    return (
      <>
        <div className="mobile-menu-safe flex-shrink-0 bg-white border-b border-black/[0.09] flex items-center gap-2 px-3 py-2">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú del despacho"
            className="flex-shrink-0 w-[38px] h-[38px] rounded-[10px] bg-kbg border border-black/[0.10] flex items-center justify-center text-kmuted"
          >
            <Menu size={17} aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1 text-[12px] text-kmuted truncate">
            <span className="font-semibold text-ktext">{supervisor || 'Sin supervisor'}</span> · {totalStores} tiendas
          </div>
          <RefreshButton compact />
        </div>

        {drawerOpen && (
          <>
            <div className="fixed inset-0 bg-black/[0.38] z-[900] backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
            <div className="fixed top-0 left-0 w-[min(360px,88vw)] h-full bg-kbg z-[901] overflow-y-auto flex flex-col shadow-[4px_0_28px_rgba(0,0,0,0.16)]">
              <div className="px-4 py-3.5 border-b border-black/[0.09] bg-white flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
                <div>
                  <div className="text-[15px] font-bold text-ktext">Despacho</div>
                  <div className="text-[11px] text-kmuted">{dnom[dia] || 'Hoy'} · {activeCount > 0 ? `${activeCount} con carga` : 'sin carga asignada'}</div>
                </div>
                <button onClick={() => setDrawerOpen(false)} aria-label="Cerrar menú"
                  className="w-[32px] h-[32px] rounded-full bg-kbg border border-black/[0.09] flex items-center justify-center text-kmuted">
                  <X size={16} aria-hidden="true" />
                </button>
              </div>

              <div className="p-4 flex flex-col gap-4 flex-shrink-0">
                <HeaderFields
                  supervisor={supervisor} onSupervisor={onSupervisor}
                  fecha={fecha} onFecha={onFecha} hoy={hoy} manana={manana}
                  stacked
                />
                <button
                  onClick={() => { onOpenParadas(); setDrawerOpen(false); }}
                  className="w-full flex items-center justify-center gap-1.5 h-[42px] rounded-[10px] bg-knavy text-white text-[13px] font-bold active:scale-[0.98] transition-all"
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

              {mapContent && (
                <div className="flex-1 min-h-[360px] border-t border-black/[0.09]">
                  {mapContent}
                </div>
              )}
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <div className="flex-shrink-0 bg-white border-b border-black/[0.09] mobile-menu-safe">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">

        <HeaderFields
          supervisor={supervisor} onSupervisor={onSupervisor}
          fecha={fecha} onFecha={onFecha} hoy={hoy} manana={manana}
        />

        {/* Resumen del día */}
        <div className="text-[12px] text-kmuted whitespace-nowrap">
          <span className="font-semibold text-ktext">{dnom[dia] || 'Hoy'}</span> · {totalStores} tiendas · {activeCount > 0 ? `${activeCount} con carga` : 'sin carga asignada'}
        </div>

        <div className="flex-1 min-w-[8px]" />

        <RefreshButton />

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
