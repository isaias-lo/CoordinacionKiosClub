'use client';

// La vista nueva del Enrutador, «Un paso a la vez» (diseño A): el marco de arriba.
//
//   1. Cabecera: «Enrutador», el día de armado y el de salida, y el menú ···.
//   2. Pestañas, con la activa subrayada en su color.
//   3. La banda: qué falta ahora, una línea de contexto y un solo botón (ver `bandaEnrutador.ts`).
//
// Solo presentación. Lo que antes estaba en la barra de la cabecera clásica (supervisor, día de
// armado, salida, asignación automática, actualizar, paradas, tablero vivo, terminar día,
// limpiar) vive en el menú ···, con los mismos controles y manejadores. El contenido de cada
// pestaña es el de siempre (InputSection con `sinBarra`).

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, MoreHorizontal, X } from 'lucide-react';
import { PASOS_DIA, type Banda, type SeccionEnrutador } from '../utils/bandaEnrutador';

/** Pestañas y su color, como en el diseño. */
export const PESTANAS: { id: SeccionEnrutador; texto: string; color: string }[] = [
  { id: 'drag',  texto: 'Despacho',   color: '#1B2A6B' },
  { id: 'cong',  texto: 'Congelados', color: '#0E7490' },
  { id: 'v2',    texto: '2ª vuelta',  color: '#5B21B6' },
  { id: 'flota', texto: 'Flota',      color: '#1B2A6B' },
  { id: 'plan',  texto: 'Plan',       color: '#0F766E' },
  { id: 'cal',   texto: 'Calendario', color: '#B45309' },
];

export function colorDe(modo: string): string {
  return PESTANAS.find(p => p.id === modo)?.color ?? '#1B2A6B';
}

interface Props {
  /** «lunes 6 oct» */
  armado: string;
  /** «martes 7 oct». La regla (seco / congelados) y la corrección manual ya vienen resueltas. */
  sale: string;
  modo: string;
  onModo: (m: SeccionEnrutador) => void;
  /** Con resultados calculados abiertos, Despacho queda en pausa igual que en la vista clásica. */
  pestanaBloqueada?: (m: SeccionEnrutador) => boolean;
  pendientesBacklog: number;
  banda: Banda;
  onAccion: (id: NonNullable<Banda['accion']>['id']) => void;
  esMovil: boolean;
  /** El contenido del menú ···. Recibe `cerrar` para que cada acción cierre el menú. */
  menu: (cerrar: () => void) => ReactNode;
  /** Reemplaza «Armado → Sale» cuando la pestaña no sigue esa regla (la 2ª vuelta sale hoy). */
  cabecera?: { etiqueta: string; fecha: string; nota?: string };
  /** Algo propio de la pestaña a la izquierda de la banda, donde otras muestran los pasos. */
  bandaInicio?: ReactNode;
}

export default function MarcoEnrutador({
  armado, sale, modo, onModo, pestanaBloqueada, pendientesBacklog, banda, onAccion, esMovil, menu,
  cabecera, bandaInicio,
}: Props) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const color = colorDe(modo);
  const pasos = banda.pasos ?? PASOS_DIA;

  useEffect(() => {
    if (!menuAbierto) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuAbierto(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [menuAbierto]);

  const cerrar = () => setMenuAbierto(false);

  return (
    <div className="flex-shrink-0 relative">
      {/* 1. Cabecera */}
      <header className="mobile-menu-safe bg-white border-b border-black/[0.09] flex items-center gap-3 md:gap-6 px-3 md:px-5 min-h-[56px] py-1.5">
        <span className="font-barlow-condensed text-cifra font-extrabold text-knavy leading-none">Enrutador</span>
        {cabecera ? (
          <div className="flex items-center gap-1.5 md:gap-2.5 text-apoyo min-w-0 flex-wrap">
            <span className="text-kmuted">{cabecera.etiqueta}</span>
            <strong className="font-semibold text-ktext whitespace-nowrap">{cabecera.fecha}</strong>
            {cabecera.nota && <span className="hidden md:inline text-kmuted">· {cabecera.nota}</span>}
          </div>
        ) : (
        <div className="flex items-center gap-1.5 md:gap-2.5 text-apoyo min-w-0 flex-wrap">
          <span className="hidden md:inline text-kmuted">Armado</span>
          <strong className="hidden md:inline font-semibold text-ktext whitespace-nowrap">{armado}</strong>
          <ArrowRight size={16} className="hidden md:block text-kmuted flex-shrink-0" aria-hidden="true" />
          <span className="text-kmuted">Sale</span>
          <strong className="font-semibold text-ktext whitespace-nowrap">{sale}</strong>
        </div>
        )}
        <div className="flex-1" />
        <button type="button" onClick={() => setMenuAbierto(v => !v)}
          aria-label="Menú del despacho" aria-expanded={menuAbierto}
          className={`w-[44px] h-[44px] flex-shrink-0 rounded-[10px] border flex items-center justify-center transition-colors ${
            menuAbierto ? 'bg-knavy text-white border-knavy' : 'bg-white text-ktext border-black/[0.14] hover:border-black/[0.28]'}`}>
          <MoreHorizontal size={20} aria-hidden="true" />
        </button>
      </header>

      {/* 2. Pestañas */}
      <nav aria-label="Secciones del Enrutador"
        className="bg-white border-b border-black/[0.09] flex items-stretch gap-1 px-2 md:px-4 h-[46px] overflow-x-auto [scrollbar-width:none]">
        {PESTANAS.map(p => {
          const activa = modo === p.id;
          const bloqueada = pestanaBloqueada?.(p.id) ?? false;
          return (
            <button key={p.id} type="button" disabled={bloqueada}
              onClick={() => onModo(p.id)}
              aria-current={activa ? 'page' : undefined}
              className={`flex-shrink-0 px-3 md:px-3.5 flex items-center gap-1.5 text-apoyo border-b-[3px] -mb-px whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-default ${
                activa ? 'font-bold' : 'font-semibold text-kmuted border-transparent hover:text-ktext'}`}
              style={activa ? { color: p.color, borderBottomColor: p.color } : undefined}>
              {p.texto}
              {p.id === 'v2' && pendientesBacklog > 0 && (
                <span className="text-rotulo font-bold bg-purple-100 text-purple-800 rounded-full px-1.5"
                  aria-label={`${pendientesBacklog} pendientes de días anteriores`}>
                  {pendientesBacklog}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 3. La banda */}
      <section aria-live="polite"
        className="bg-white border-b border-black/[0.09] px-3 md:px-5 py-3 flex flex-col md:flex-row md:items-center gap-3 md:gap-7">
        {banda.paso !== null && (
          esMovil ? (
            <span className="text-rotulo font-bold uppercase text-kmuted">
              Paso {banda.paso} de {pasos.length} · {pasos[banda.paso - 1]}
            </span>
          ) : (
            <ol className="flex items-center gap-2.5 list-none m-0 p-0 flex-shrink-0" aria-label={`Paso ${banda.paso} de ${pasos.length}`}>
              {pasos.map((nombre, i) => {
                const n = i + 1;
                const hecho = n < banda.paso!;
                const activo = n === banda.paso;
                return (
                  <li key={nombre} className="flex items-center gap-2.5" aria-current={activo ? 'step' : undefined}>
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-apoyo font-bold flex-shrink-0 ${
                      activo ? 'text-white' : hecho ? 'bg-est-ok-suave text-est-ok' : 'bg-white text-kmuted border-[1.5px] border-black/[0.18]'}`}
                      style={activo ? { background: color } : undefined}>
                      {hecho ? '✓' : n}
                    </span>
                    <span className={`text-apoyo whitespace-nowrap ${activo ? 'font-bold' : 'font-semibold text-kmuted'}`}
                      style={activo ? { color } : undefined}>
                      {nombre}
                    </span>
                    {i < pasos.length - 1 && <span className="w-5 h-0.5 bg-black/[0.12]" aria-hidden="true" />}
                  </li>
                );
              })}
            </ol>
          )
        )}
        {bandaInicio}
        <div className={`flex-1 min-w-0 flex flex-col gap-0.5 ${(banda.paso !== null || bandaInicio) && !esMovil ? 'pl-5 border-l border-black/[0.09]' : ''}`}>
          <span className="text-titulo font-bold text-ktext">{banda.titular}</span>
          <span className="text-apoyo text-kmuted">{banda.subtitulo}</span>
        </div>
        {banda.accion && (
          <button type="button" onClick={() => onAccion(banda.accion!.id)}
            className="flex-shrink-0 rounded-[12px] px-5 min-h-[44px] text-cuerpo font-bold text-white active:scale-[0.98] transition-transform"
            style={{ background: color }}>
            {banda.accion.texto}
          </button>
        )}
      </section>

      {/* El menú ···: panel bajo la cabecera en escritorio, cajón lateral en el teléfono. */}
      {menuAbierto && (
        <>
          <div className={`fixed inset-0 z-[900] ${esMovil ? 'bg-black/[0.38] backdrop-blur-sm' : ''}`} onClick={cerrar} aria-hidden="true" />
          <div role="dialog" aria-label="Menú del despacho"
            className={esMovil
              ? 'fixed top-0 right-0 w-[min(360px,88vw)] h-full bg-kbg z-[901] overflow-y-auto flex flex-col shadow-[-4px_0_28px_rgba(0,0,0,0.16)]'
              : 'absolute top-[52px] right-4 w-[380px] max-h-[calc(100vh-80px)] overflow-y-auto bg-white border border-black/[0.09] rounded-[14px] z-[901] shadow-[0_12px_32px_rgba(20,30,60,0.18)] flex flex-col'}>
            <div className="px-4 py-3 border-b border-black/[0.09] bg-white flex items-center justify-between sticky top-0 z-10">
              <span className="text-cuerpo font-bold text-ktext">Despacho</span>
              <button type="button" onClick={cerrar} aria-label="Cerrar menú"
                className="w-[36px] h-[36px] rounded-full bg-kbg border border-black/[0.09] flex items-center justify-center text-kmuted">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            {menu(cerrar)}
          </div>
        </>
      )}
    </div>
  );
}

/** Un renglón del menú ···: mismo alto y mismo peso para todas las acciones. */
export function AccionMenu({ onClick, children, tono = 'normal' }: {
  onClick: () => void; children: ReactNode; tono?: 'normal' | 'suave';
}) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full min-h-[44px] px-3 rounded-[10px] flex items-center gap-2 text-apoyo font-bold text-left transition-colors ${
        tono === 'suave' ? 'text-kmuted hover:bg-black/[0.04]' : 'text-knavy bg-white border border-black/[0.10] hover:border-knavy/40'}`}>
      {children}
    </button>
  );
}
