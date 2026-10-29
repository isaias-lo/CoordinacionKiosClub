'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { AyudaBodega } from './AyudaBodega';
import {
  TIPOS_SIMPLES, TIPOS_MEZCLA, componentesDe, esMezcla, abreviaturaContenido, nombreContenido,
  type ClaseContenido, type ComponenteCarga,
} from './contenidoCarga';

// El «Tipo de carga» de la tarjeta de Bodega, el mismo en Nacional y RM/Costa.
//
// Cuatro botones (Comida, Hogar, Aseo, Chocolate) y «⋯» para las cuatro mezclas. Si la unidad la
// armó Picking, el tipo viene de su etiqueta y queda BLOQUEADO: se ve, y «⋯» abre el detalle solo
// para leer. Pedido de Isaias el 13/10/2026; mockup en /mnt/project-files/bodegas/categorias/.

const ESTILO_ON: Record<ClaseContenido, string> = {
  comida:              'border-comida text-comida bg-comida/10',
  hogar:               'border-hogar text-hogar bg-hogar/10',
  aseo:                'border-aseo text-aseo bg-aseo/10',
  chocolate:           'border-choco text-choco bg-choco/10',
  'comida-hogar':      'border-mixto text-mixto bg-mixto/10',
  'comida-aseo':       'border-mixto text-mixto bg-mixto/10',
  'hogar-aseo':        'border-mixto text-mixto bg-mixto/10',
  'comida-hogar-aseo': 'border-mixto text-mixto bg-mixto/10',
};

const PUNTO: Record<ComponenteCarga, string> = { comida: 'bg-comida', hogar: 'bg-hogar', aseo: 'bg-aseo' };

/** Un punto de color por cada tipo que trae la mezcla. */
export function PuntosCarga({ valor }: { valor: ClaseContenido }) {
  return (
    <span className="inline-flex gap-[3px]" aria-hidden="true">
      {componentesDe(valor).map(k => <i key={k} className={`block w-2 h-2 rounded-full ${PUNTO[k]}`} />)}
    </span>
  );
}

export function SelectorTipoCarga({ valor, bloqueado, onCambiar }: {
  valor: ClaseContenido;
  /** La unidad viene de Picking: se muestra, no se cambia. */
  bloqueado: boolean;
  onCambiar: (nuevo: ClaseContenido) => void;
}) {
  const mezcla = esMezcla(valor);
  const [abierto, setAbierto] = useState(false);
  const base = 'min-h-[44px] rounded-btn border font-bold text-apoyo transition-all';
  const apagado = 'border-border bg-bg-2 text-text-2';

  return (
    <div className="mb-1.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-rotulo font-bold text-text-sub uppercase">Tipo de carga</span>
        <AyudaBodega tema="tipoCarga" />
        {bloqueado && (
          <span className="inline-flex items-center gap-1 rounded-full bg-bg-2 px-2 py-0.5 text-rotulo font-bold text-text-2">
            <Lock size={11} aria-hidden="true" /> de la etiqueta de Picking
          </span>
        )}
      </div>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Tipo de carga">
        {TIPOS_SIMPLES.map(t => {
          const on = valor === t;
          return (
            <button key={t} type="button" role="radio" aria-checked={on} title={nombreContenido(t)}
              disabled={bloqueado}
              onClick={() => { onCambiar(t); setAbierto(false); }}
              className={`flex-1 ${base} ${on ? `${ESTILO_ON[t]} border-2` : apagado} ${bloqueado ? (on ? 'cursor-default' : 'opacity-40 cursor-default') : 'cursor-pointer'}`}>
              {abreviaturaContenido(t)}
            </button>
          );
        })}
        <button type="button" aria-expanded={abierto}
          aria-label={mezcla ? `Mezcla: ${nombreContenido(valor)}` : 'Ver mezclas'}
          title={mezcla ? nombreContenido(valor) : 'Mezclas'}
          onClick={() => setAbierto(a => !a)}
          className={`${base} cursor-pointer inline-flex items-center justify-center gap-1.5 ${mezcla ? `px-3 border-2 ${ESTILO_ON[valor]}` : `w-[52px] ${apagado} ${bloqueado ? 'opacity-40' : ''}`}`}>
          {mezcla && <PuntosCarga valor={valor} />}
          <span className="tracking-widest">⋯</span>
        </button>
      </div>
      {abierto && (
        <div className="mt-1.5 rounded-kios border border-border bg-card p-1 shadow-kios" role="radiogroup" aria-label="Mezclas">
          {TIPOS_MEZCLA.map(t => {
            const on = valor === t;
            return (
              <button key={t} type="button" role="radio" aria-checked={on}
                disabled={bloqueado}
                onClick={() => { onCambiar(t); setAbierto(false); }}
                className={`w-full min-h-[44px] flex items-center gap-2.5 rounded-btn px-2.5 text-cuerpo font-bold text-left border-none ${on ? 'bg-mixto/10 text-mixto' : 'bg-transparent text-text'} ${bloqueado ? (on ? 'cursor-default' : 'opacity-40 cursor-default') : 'cursor-pointer active:bg-bg-2'}`}>
                <span className="w-8"><PuntosCarga valor={t} /></span>
                {nombreContenido(t)}
                {on && <span className="ml-auto" aria-hidden="true">✓</span>}
              </button>
            );
          })}
          {bloqueado && <p className="px-2.5 pt-1 pb-0.5 m-0 text-rotulo text-text-sub">Lo marcó Picking al imprimir. Solo lectura.</p>}
        </div>
      )}
    </div>
  );
}
