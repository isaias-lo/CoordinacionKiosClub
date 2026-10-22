'use client';

// Barra de «sumar en masa» al pie de la tienda (Nacional y RM/Costa): se marcan bultos y
// chocolates guardados y se suman de un toque a un pallet.
//
// Rediseño del 19/10/2026 (Isaias): antes era una franja azul con «+ Nuevo» y «Eliminar».
// Los dos se fueron a pedido suyo. «+ Nuevo» repetía el «+» de la cabecera de la tienda, y
// «Eliminar» borraba varias unidades guardadas de un golpe, justo lo que no tiene que pasar con
// lo ya pesado (ver bodega-pallet-no-se-borra). Borrar una sigue en su línea, con su confirmación.

import { Check } from 'lucide-react';

export interface PalletDestino {
  id: string;
  etiqueta: string;
  /** Ya guardado. Si no, sumar le fija el peso pero hay que acordarse de agregarlo. */
  agregado: boolean;
}

export default function BarraSumarBultos({ total, seleccionados, onTodos, pallets, onSumar }: {
  total: number;
  seleccionados: number;
  onTodos: () => void;
  pallets: PalletDestino[];
  onSumar: (palletId: string) => void;
}) {
  const todos = seleccionados > 0 && seleccionados === total;
  const hay = seleccionados > 0;
  return (
    // Se pega al pie solo con algo marcado. Sin marcas era una franja fija que en el teléfono tapaba
    // lo último de la lista, justo donde se abre «Juntar con…» (prueba del 22/10/2026).
    <div className={`${hay ? 'sticky bottom-2 z-10' : ''} mt-2 mb-2 rounded-kios border border-border bg-card/95 backdrop-blur shadow-kios px-3 py-2.5 flex items-center gap-3 flex-wrap`}>
      <button type="button" onClick={onTodos} aria-pressed={todos}
        className="min-h-[44px] flex items-center gap-2 cursor-pointer bg-transparent border-none p-0 text-left">
        <span className={`w-5 h-5 rounded-md flex items-center justify-center border-2 transition-colors ${
          todos ? 'bg-navy border-navy text-white' : 'border-border-2 bg-card'}`} aria-hidden="true">
          {todos && <Check size={14} strokeWidth={3} />}
        </span>
        <span className="text-apoyo font-semibold text-text">
          {hay ? `${seleccionados} de ${total} marcados` : 'Marca los bultos y chocolates que van dentro de un pallet'}
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1.5 flex-wrap">
        {pallets.length === 0 ? (
          <span className="text-rotulo text-text-sub normal-case tracking-normal">Agrega un pallet con «+» para sumar</span>
        ) : (
          <>
            <span className="text-apoyo font-bold text-text-2 mr-0.5">Sumar a</span>
            {pallets.map(p => (
              <button key={p.id} type="button" disabled={!hay} onClick={() => onSumar(p.id)}
                title={p.agregado ? `Sumar los marcados a ${p.etiqueta}` : `Sumar a ${p.etiqueta}, que todavía no está agregado: acuérdate de agregarlo`}
                className={`min-w-[44px] h-[44px] px-3.5 rounded-full font-barlow-condensed text-apoyo font-extrabold cursor-pointer transition-colors
                  disabled:cursor-not-allowed disabled:opacity-45 ${
                  p.agregado
                    ? 'bg-uni-pallet text-white border-none active:opacity-80'
                    : 'bg-uni-pallet-suave text-uni-pallet border-2 border-dashed border-uni-pallet'}`}>
                {p.etiqueta}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * La casilla para marcar un bulto o chocolate guardado. Se ve de 22 px pero se toca en 44: la de
 * antes era de 19 px, demasiado chica para el dedo con guantes (análisis del 22/10/2026).
 */
export function CasillaMarcar({ marcada, onCambiar, etiqueta }: { marcada: boolean; onCambiar: () => void; etiqueta: string }) {
  return (
    <label className="w-[44px] h-[44px] -ml-2 -my-1 flex items-center justify-center flex-shrink-0 cursor-pointer">
      <input type="checkbox" checked={marcada} onChange={onCambiar}
        aria-label={`Marcar ${etiqueta} para sumarlo a un pallet`}
        className="w-[22px] h-[22px] cursor-pointer" style={{ accentColor: 'var(--uni-pallet)' }} />
    </label>
  );
}
