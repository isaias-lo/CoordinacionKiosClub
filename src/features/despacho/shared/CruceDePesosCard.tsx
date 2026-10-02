'use client';

// El bloque CRUCE DE PESOS dentro de la tarjeta de una tienda. Solo dibuja: toda la regla vive en
// `cruceTienda.ts`, con sus tests.
//
// ── TRAE SU PROPIO FONDO ───────────────────────────────────────────────────────────────────────
//
// Este bloque se rompió DOS VECES por depender de lo que tuviera detrás, así que ya no depende.
//
//   1ª  Se dibujó con blancos semitransparentes (`bg-white/70`) y grises suaves — correcto sobre
//       una superficie clara. Pero cayó sobre el navy del encabezado: cada blanco al 70% se volvió
//       lavanda y cada gris perdió contraste. Se veía, pero no se leía.
//
//   2ª  Se pasó a panel blanco sólido, que sobre navy quedó impecable… y en la otra pantalla,
//       donde el fondo es claro, el panel blanco sobre blanco dejó de leerse como panel: flotaba.
//
// La conclusión no es "elegir bien el fondo" —eso ya falló dos veces, una por lado— sino que el
// COMPONENTE SE LO TRAIGA. Va montado sobre su propia base navy, así que se ve idéntico esté donde
// esté: sobre el encabezado azul la base se funde y no se nota, y sobre blanco da el marco que le
// faltaba. Un componente que se ve distinto según dónde lo pongan es un componente a medias.
//
// El color del estado no tiñe el fondo —eso fue lo que ensució todo la primera vez— sino que vive
// en tres lugares precisos: la barra de la izquierda, el número de la diferencia, y la franja de
// la frase final.
//
// Las REFERENCIAS van en negro y en monoespaciada, no en gris: son el dato que se copia y se pega
// en Odoo. Poner en gris lo único que alguien va a seleccionar con el mouse es al revés.
//
// ── SE PLIEGA ──────────────────────────────────────────────────────────────────────────────────
//
// Tocar la cabecera lo abre o lo cierra. Plegado queda en UNA línea con la diferencia, que es el
// número que importa; el resto aparece al abrirlo. En el teléfono arranca plegado y en el
// escritorio abierto, hasta que la persona elige: ver `plegadoCruce.ts`.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FilaCruce, TipoCruce } from './cruceDePesos';
import { armarBloqueCruce, fraseDeEstado, enKg, type BloqueCruce } from './cruceTienda';
import {
  alternar, estaPlegado, leerPreferencia, CLAVE_PLEGADO_CRUCE, type PreferenciaPlegado,
} from './plegadoCruce';

const COLOR: Record<TipoCruce, { fg: string; bg: string }> = {
  comida:    { fg: '#92400E', bg: '#FEF3C7' },
  aseo:      { fg: '#1E40AF', bg: '#DBEAFE' },
  hogar:     { fg: '#6B21A8', bg: '#EDE9FE' },
  chocolate: { fg: '#7C2D12', bg: '#FFEDD5' },
};

// Tres estados, no dos. El gris de "sin pesar" NO es un estado de error: es que todavía no hay
// nada que comparar, y teñirlo de rojo haría que la tarjeta empiece el día acusando.
const TONO: Record<BloqueCruce['estado'], { barra: string; texto: string; franja: string }> = {
  'cuadra':    { barra: '#16A34A', texto: '#15803D', franja: '#F0FDF4' },
  'revisar':   { barra: '#DC2626', texto: '#B91C1C', franja: '#FEF2F2' },
  'sin-pesar': { barra: '#C7C7CC', texto: '#6B7280', franja: '#F9FAFB' },
};

const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`;

interface Props {
  /** La fila de Odoo de ESTA tienda, o `null` si el día todavía no cargó. */
  cruce: FilaCruce | null | undefined;
  /** Las unidades que Bodega tiene cargadas en la tienda. */
  items: { peso?: number | null; tipo?: string | null; pkg?: string | null }[];
  /** `false` mientras la consulta del día está en vuelo. */
  listo?: boolean;
}

export function CruceDePesosCard({ cruce, items, listo = true }: Props) {
  const b = useMemo(() => armarBloqueCruce(cruce, items), [cruce, items]);
  const tono = TONO[b.estado];
  const { pref, ancho, tocar } = usePlegadoCruce();
  const plegadoAhora = estaPlegado(pref, ancho);
  const vis = clasesPlegado(pref);
  // La flecha apunta abajo plegado ("hay más") y arriba abierto.
  const giro = pref === null ? 'md:rotate-180' : pref === 'abierto' ? 'rotate-180' : '';

  if (!listo) {
    return (
      <Base>
        <div className="rounded-[10px] bg-white px-3 py-2.5 text-[12px] text-[#6B7280]">
          Cruce de pesos · cargando los movimientos del día…
        </div>
      </Base>
    );
  }

  return (
    <Base>
    <div className="rounded-[10px] overflow-hidden bg-white"
      style={{ borderLeft: `4px solid ${tono.barra}`, boxShadow: '0 2px 10px rgba(0,0,0,0.18)' }}>

      {/* Cabecera: es el botón que pliega. Plegada, a la derecha va la diferencia en vez de los
          movimientos, para que la línea sola diga si hay algo que mirar. */}
      <button type="button" onClick={tocar} aria-expanded={!plegadoAhora}
        className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <span className="text-[10px] font-extrabold tracking-wider uppercase text-[#1C1C1E] whitespace-nowrap">
          Cruce de pesos
        </span>
        <span className={`${vis.abierto('inline')} text-[9px] font-bold uppercase tracking-wide px-1.5 py-[2px] rounded text-[#6B7280] bg-[#F1F1F4] whitespace-nowrap`}>
          solo administración
        </span>
        <span className={`${vis.abierto('inline')} ml-auto text-[11px] text-[#6B7280] tabular-nums whitespace-nowrap`}>
          {b.movimientos.length
            ? `${b.movimientos.length} ${b.movimientos.length === 1 ? 'movimiento' : 'movimientos'}`
            : 'sin movimientos'}
        </span>
        <span className={`${vis.plegado('inline')} ml-auto text-[12px] tabular-nums whitespace-nowrap truncate min-w-0`}>
          {b.kgDif === null
            ? <span className="text-[#6B7280]">{b.kgOdoo > 0 ? `sin pesar · Odoo ${enKg(b.kgOdoo)} kg` : 'sin pesar'}</span>
            : <span className="font-extrabold" style={{ color: tono.texto }}>
                {`${b.kgDif > 0 ? '+' : ''}${enKg(b.kgDif)} kg`}
                {b.pctDif === null ? '' : <span className="font-bold"> · {pct(b.pctDif)}</span>}
              </span>}
        </span>
        <svg viewBox="0 0 20 20" aria-hidden="true"
          className={`w-4 h-4 flex-shrink-0 text-[#6B7280] transition-transform ${giro}`}>
          <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className={vis.abierto('block')}>
      {/* Los tres números */}
      <div className="grid grid-cols-3 border-t border-[#E9E9ED]">
        <Celda rotulo="Pesado en Bodega"
          valor={b.kgBodega === null ? '—' : enKg(b.kgBodega)}
          apagado={b.kgBodega === null}
          pie={`${b.pesadas} de ${b.unidades} ${b.unidades === 1 ? 'unidad' : 'unidades'}`} />
        <Celda rotulo="Según Odoo" borde
          valor={enKg(b.kgOdoo)}
          pie={b.movimientos.length ? `suma de ${b.movimientos.length}` : '—'} />
        <Celda rotulo="Diferencia" borde
          // El signo va SIEMPRE, también en positivo: "+14" y "14" no dicen lo mismo cuando lo que
          // importa es de qué lado está el faltante.
          valor={b.kgDif === null ? '—' : `${b.kgDif > 0 ? '+' : ''}${enKg(b.kgDif)}`}
          apagado={b.kgDif === null}
          color={b.kgDif === null ? undefined : tono.texto}
          pie={b.pctDif === null ? '' : pct(b.pctDif)}
          piePeso />
      </div>

      {/* Detalle: la referencia COMPLETA, en negro, porque es lo que se copia a Odoo */}
      {b.movimientos.length > 0 && (
        <div className="border-t border-[#E9E9ED] px-3 py-2 flex flex-col gap-[5px]">
          {b.movimientos.map(m => (
            <div key={m.tipo} className="flex items-center gap-2 text-[11.5px] min-w-0">
              <span className="font-bold uppercase tracking-wide px-1.5 py-[2px] rounded flex-shrink-0 text-[9px] w-[66px] text-center"
                style={{ color: COLOR[m.tipo].fg, background: COLOR[m.tipo].bg }}>
                {m.tipo}
              </span>
              <span className="font-mono text-[#1C1C1E] truncate min-w-0" title={m.refs.join(', ')}>
                {m.refs.join(', ') || '—'}
              </span>
              <span className="ml-auto font-bold text-[#1C1C1E] tabular-nums flex-shrink-0">
                {enKg(m.kg)} <span className="text-[9px] font-semibold text-[#6B7280]">kg</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* La frase: qué significa y, si hay algo que hacer, qué */}
      <div className="px-3 py-2 text-[11.5px] leading-snug font-medium border-t border-[#E9E9ED]"
        style={{ background: tono.franja, color: tono.texto }}>
        {fraseDeEstado(b)}
      </div>
      </div>
    </div>
    </Base>
  );
}

/**
 * Qué se ve plegado y qué abierto. Sin elección (`null`) lo decide el ancho por CSS, con el mismo
 * corte `md` que `ANCHO_ESCRITORIO`; con elección, manda ella en cualquier pantalla.
 */
function clasesPlegado(pref: PreferenciaPlegado) {
  // Escritas enteras a propósito: Tailwind solo genera las clases que encuentra literales en el
  // código, y un `md:${d}` armado al vuelo no existiría en el CSS.
  const ABIERTO = { block: 'hidden md:block', inline: 'hidden md:inline' } as const;
  const PLEGADO = { block: 'block md:hidden', inline: 'inline md:hidden' } as const;
  return {
    abierto: (d: 'block' | 'inline') => pref === null ? ABIERTO[d] : pref === 'abierto' ? d : 'hidden',
    plegado: (d: 'block' | 'inline') => pref === null ? PLEGADO[d] : pref === 'plegado' ? d : 'hidden',
  };
}

const EVENTO_PLEGADO = 'bodega-cruce-plegado';

/**
 * La elección guardada en el equipo, más el ancho de pantalla para saber qué se ve al tocar.
 *
 * Arranca en `null` y se hidrata en un efecto: leer localStorage en el render desajusta el HTML del
 * servidor y el del cliente (lo mismo que `useRegistroDeTiendas`). Si hay más de un bloque
 * montado, el evento los mantiene de acuerdo.
 */
function usePlegadoCruce() {
  const [pref, setPref] = useState<PreferenciaPlegado>(null);
  const [ancho, setAncho] = useState(1024);

  useEffect(() => {
    const leer = () => {
      try { setPref(leerPreferencia(localStorage.getItem(CLAVE_PLEGADO_CRUCE))); } catch { /* sin storage */ }
    };
    const medir = () => setAncho(window.innerWidth);
    leer(); medir();
    window.addEventListener(EVENTO_PLEGADO, leer);
    window.addEventListener('resize', medir);
    return () => {
      window.removeEventListener(EVENTO_PLEGADO, leer);
      window.removeEventListener('resize', medir);
    };
  }, []);

  const tocar = useCallback(() => {
    const next = alternar(pref, window.innerWidth);
    setPref(next);
    try { localStorage.setItem(CLAVE_PLEGADO_CRUCE, next); } catch { /* sin storage, igual se pliega */ }
    window.dispatchEvent(new Event(EVENTO_PLEGADO));
  }, [pref]);

  return { pref, ancho, tocar };
}

/**
 * La base navy sobre la que se apoya el panel.
 *
 * Es el mismo `navy.DEFAULT` que usan los encabezados de las dos bodegas: sobre ellos se funde y no
 * se nota; sobre un fondo claro, le da al panel blanco el marco sin el cual no se lee como panel.
 */
function Base({ children }: { children: React.ReactNode }) {
  return <div className="bg-navy rounded-[12px] p-2">{children}</div>;
}

function Celda({ rotulo, valor, pie, apagado, color, borde, piePeso }: {
  rotulo: string; valor: string; pie?: string; apagado?: boolean;
  color?: string; borde?: boolean; piePeso?: boolean;
}) {
  return (
    <div className={`px-3 py-2 min-w-0 ${borde ? 'border-l border-[#E9E9ED]' : ''}`}>
      <div className="text-[9px] font-bold uppercase tracking-wide text-[#6B7280] truncate">{rotulo}</div>
      <div className="flex items-baseline gap-1 min-w-0 mt-0.5">
        <span className="text-[19px] font-extrabold tabular-nums truncate leading-none"
          style={{ color: apagado ? '#C7C7CC' : (color ?? '#1C1C1E') }}>
          {valor}
        </span>
        <span className="text-[10px] font-semibold text-[#6B7280] flex-shrink-0">kg</span>
      </div>
      {pie
        ? <div className="text-[10px] truncate tabular-nums mt-0.5"
            style={{ color: piePeso ? (color ?? '#6B7280') : '#6B7280', fontWeight: piePeso ? 700 : 400 }}>
            {pie}
          </div>
        : null}
    </div>
  );
}
