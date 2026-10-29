'use client';

// «Juntar con…»: el único botón para juntar una unidad con otra, en Nacional y RM/Costa.
//
// Existe por el análisis del 22/10/2026. Para casi lo mismo había tres palabras —«Sumar a
// Pallet», «Unificar» y «Sumar / Unificar» (y «Combinar» en el Resumen)—, en letra de 9 a 11 px,
// con botones de 30 px y una ✕ gris sin nombre para el lector. Alguien nuevo no sabía cuál usar.
// Ahora hay un solo verbo y cada destino dice qué va a pasar: «queda dentro» (un bulto o chocolate
// que se suma a un pallet) o «quedan como uno» (dos pallets que se unen). Por dentro siguen siendo
// las mismas dos operaciones; esto solo dibuja.

import { useEffect, useRef } from 'react';

export interface DestinoJuntar {
  id: string;
  etiqueta: string;
  /** `sumar`: el origen queda dentro del destino. `unir`: los dos quedan como una sola unidad. */
  efecto: 'sumar' | 'unir';
  onElegir: () => void;
}

const EFECTO: Record<DestinoJuntar['efecto'], string> = {
  sumar: 'queda dentro',
  unir: 'quedan como uno',
};

export function JuntarCon({ origen, abierto, onAbrir, onCerrar, destinos }: {
  /** «B1», «P3»: la unidad que se va a juntar. */
  origen: string;
  abierto: boolean;
  onAbrir: () => void;
  onCerrar: () => void;
  destinos: DestinoJuntar[];
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Al abrir, que se vean los destinos: en el teléfono el panel suele abrirse al fondo de la lista.
  useEffect(() => {
    if (abierto) panel.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [abierto]);
  if (destinos.length === 0) return null;
  if (!abierto) {
    return (
      <button type="button" onClick={onAbrir}
        className="w-full min-h-[44px] mt-2 rounded-btn border-[1.5px] border-dashed border-uni-pallet bg-uni-pallet-suave text-uni-pallet text-apoyo font-bold cursor-pointer active:opacity-80">
        Juntar {origen} con…
      </button>
    );
  }
  return (
    <div ref={panel} role="group" aria-label={`Juntar ${origen} con otra unidad`}
      className="mt-2 rounded-btn border-[1.5px] border-uni-pallet bg-uni-pallet-suave p-2 flex flex-col gap-2">
      <div className="text-apoyo font-bold text-text">¿Con cuál juntas {origen}?</div>
      <div className="flex flex-wrap gap-2">
        {destinos.map(d => (
          <button key={d.id} type="button" onClick={d.onElegir}
            aria-label={`Juntar ${origen} con ${d.etiqueta}: ${d.efecto === 'sumar' ? `${origen} queda dentro de ${d.etiqueta}` : 'quedan como una sola unidad'}`}
            className="flex-1 min-w-[88px] min-h-[44px] px-3 py-1 rounded-btn bg-card border-2 border-uni-pallet text-uni-pallet cursor-pointer active:opacity-80 flex flex-col items-center justify-center leading-tight">
            <span className="font-barlow-condensed text-cuerpo font-extrabold">{d.etiqueta}</span>
            <span className="text-rotulo font-semibold text-text-sub normal-case tracking-normal">{EFECTO[d.efecto]}</span>
          </button>
        ))}
        <button type="button" onClick={onCerrar}
          className="min-h-[44px] px-3 rounded-btn bg-card border border-border text-text-2 text-apoyo font-bold cursor-pointer active:bg-bg-2">
          Cancelar
        </button>
      </div>
    </div>
  );
}
