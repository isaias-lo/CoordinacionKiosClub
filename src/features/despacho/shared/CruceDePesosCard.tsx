'use client';

// El bloque CRUCE DE PESOS dentro de la tarjeta de una tienda. Solo dibuja: toda la regla vive en
// `cruceTienda.ts`, con sus tests.
//
// Va arriba, debajo del encabezado de la tienda, porque contesta la pregunta que se hace JUSTO
// ANTES de marcarla terminada: ¿está todo lo que tenía que estar?

import { useMemo } from 'react';
import type { FilaCruce, TipoCruce } from './cruceDePesos';
import { armarBloqueCruce, fraseDeEstado, enKg, type BloqueCruce } from './cruceTienda';

const COLOR: Record<TipoCruce, { fg: string; bg: string }> = {
  comida:    { fg: '#B45309', bg: 'rgba(217,119,6,0.12)' },
  aseo:      { fg: '#1D4ED8', bg: 'rgba(37,99,235,0.10)' },
  hogar:     { fg: '#6B21A8', bg: 'rgba(107,33,168,0.10)' },
  chocolate: { fg: '#92400E', bg: 'rgba(120,53,15,0.10)' },
};

// Tres estados, no dos. El gris de "sin pesar" NO es un estado de error: es que todavía no hay
// nada que comparar, y teñirlo de rojo haría que la tarjeta empiece el día acusando.
const TONO: Record<BloqueCruce['estado'], { borde: string; fondo: string; texto: string }> = {
  'cuadra':    { borde: 'rgba(22,163,74,0.35)',  fondo: 'rgba(22,163,74,0.06)',  texto: '#15803D' },
  'revisar':   { borde: 'rgba(211,47,47,0.35)',  fondo: 'rgba(211,47,47,0.05)',  texto: '#B91C1C' },
  'sin-pesar': { borde: 'rgba(27,42,107,0.14)',  fondo: 'rgba(27,42,107,0.03)',  texto: '#8E8E93' },
};

interface Props {
  /** La fila de Odoo de ESTA tienda, o `null` si el día todavía no cargó. */
  cruce: FilaCruce | null | undefined;
  /** Las unidades que Bodega tiene cargadas en la tienda. */
  items: { peso?: number | null; tipo?: string | null; pkg?: string | null }[];
  /** `false` mientras la consulta del día está en vuelo: se muestra en gris, sin números. */
  listo?: boolean;
}

export function CruceDePesosCard({ cruce, items, listo = true }: Props) {
  const b = useMemo(() => armarBloqueCruce(cruce, items), [cruce, items]);
  const tono = TONO[b.estado];

  if (!listo) {
    return (
      <div className="rounded-[10px] border px-2.5 py-2 text-[11px] text-kmuted"
        style={{ borderColor: TONO['sin-pesar'].borde, background: TONO['sin-pesar'].fondo }}>
        Cruce de pesos · cargando los movimientos del día…
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border overflow-hidden"
      style={{ borderColor: tono.borde, background: tono.fondo }}>

      {/* Cabecera */}
      <div className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1">
        <span className="text-[9.5px] font-extrabold tracking-wider uppercase" style={{ color: tono.texto }}>
          Cruce de pesos
        </span>
        <span className="text-[8.5px] font-bold uppercase tracking-wide px-1.5 py-[1px] rounded"
          style={{ color: '#6B21A8', background: 'rgba(107,33,168,0.10)' }}>
          solo administración
        </span>
        <span className="ml-auto text-[10px] text-kmuted tabular-nums">
          {b.movimientos.length
            ? `${b.movimientos.length} movimiento${b.movimientos.length === 1 ? '' : 's'} de Odoo`
            : 'sin movimientos'}
        </span>
      </div>

      {/* Los tres números */}
      <div className="grid grid-cols-3 gap-px bg-black/[0.06] border-y" style={{ borderColor: tono.borde }}>
        <Celda
          rotulo="Pesado en Bodega"
          valor={b.kgBodega === null ? '—' : enKg(b.kgBodega)}
          apagado={b.kgBodega === null}
          pie={`${b.pesadas} de ${b.unidades} unidad${b.unidades === 1 ? '' : 'es'}`}
        />
        <Celda
          rotulo="Según Odoo"
          valor={enKg(b.kgOdoo)}
          pie={b.movimientos.length ? `suma de ${b.movimientos.length}` : '—'}
        />
        <Celda
          rotulo="Diferencia"
          // El signo va SIEMPRE, también en positivo: "+14" y "14" no dicen lo mismo cuando lo que
          // importa es de qué lado está el faltante.
          valor={b.kgDif === null ? '—' : `${b.kgDif > 0 ? '+' : ''}${enKg(b.kgDif)}`}
          apagado={b.kgDif === null}
          color={b.kgDif === null ? undefined : tono.texto}
          pie={b.pctDif === null ? '' : `${b.pctDif > 0 ? '+' : ''}${b.pctDif}%`}
        />
      </div>

      {/* Detalle por movimiento: la referencia COMPLETA, para copiarla y pegarla en Odoo */}
      {b.movimientos.length > 0 && (
        <div className="px-2.5 py-1.5 flex flex-col gap-[3px] bg-white/60">
          {b.movimientos.map(m => (
            <div key={m.tipo} className="flex items-center gap-1.5 text-[10.5px] min-w-0">
              <span className="font-bold uppercase tracking-wide px-1 py-[1px] rounded flex-shrink-0 text-[8.5px]"
                style={{ color: COLOR[m.tipo].fg, background: COLOR[m.tipo].bg }}>
                {m.tipo}
              </span>
              <span className="font-mono text-kmuted truncate min-w-0" title={m.refs.join(', ')}>
                {m.refs.join(', ') || '—'}
              </span>
              <span className="ml-auto font-semibold text-ktext tabular-nums flex-shrink-0">
                {enKg(m.kg)} kg
              </span>
            </div>
          ))}
        </div>
      )}

      {/* La frase: qué significa y, si hay algo que hacer, qué */}
      <div className="px-2.5 py-1.5 text-[10.5px] leading-snug" style={{ color: b.estado === 'cuadra' ? '#8E8E93' : tono.texto }}>
        {fraseDeEstado(b)}
      </div>
    </div>
  );
}

function Celda({ rotulo, valor, pie, apagado, color }: {
  rotulo: string; valor: string; pie?: string; apagado?: boolean; color?: string;
}) {
  return (
    <div className="bg-white/70 px-2 py-1.5 min-w-0">
      <div className="text-[8.5px] font-bold uppercase tracking-wide text-kmuted truncate">{rotulo}</div>
      <div className="flex items-baseline gap-0.5 min-w-0">
        <span className="text-[15px] font-bold tabular-nums truncate"
          style={{ color: apagado ? '#C7C7CC' : (color ?? '#1C1C1E') }}>
          {valor}
        </span>
        <span className="text-[9px] text-kmuted flex-shrink-0">kg</span>
      </div>
      {pie ? <div className="text-[9px] text-kmuted truncate tabular-nums">{pie}</div> : null}
    </div>
  );
}
