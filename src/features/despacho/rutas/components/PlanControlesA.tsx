'use client';

// [Vista nueva · Plan] Piezas chicas con el lenguaje del diseño A, para que los controles de adentro
// del Plan (armar desde el calendario, partida y llegada, agregar tiendas) se vean igual que la
// tabla de paradas: selector gris con la opción elegida en blanco, chips redondos y texto legible.
// Solo presentación: cada pieza recibe el valor y avisa el cambio, sin estado propio.

import type { ReactNode } from 'react';

export const ACENTO_PLAN = '#0F766E';

/** Selector de una opción entre pocas: fondo gris, la elegida en blanco con sombra suave. */
export function SegmentadoA<T extends string>({
  opciones, valor, onCambio, etiqueta, ancho = false,
}: {
  opciones: readonly (readonly [T, ReactNode])[];
  valor: T;
  onCambio: (v: T) => void;
  etiqueta: string;
  /** Repartir el ancho entre las opciones (para filas que ocupan todo el ancho, como los días). */
  ancho?: boolean;
}) {
  return (
    <div role="group" aria-label={etiqueta}
      className={`${ancho ? 'flex' : 'inline-flex self-start'} rounded-[10px] p-[3px] gap-[3px] max-w-full overflow-x-auto`}
      style={{ background: '#EEF0F5' }}>
      {opciones.map(([id, txt]) => {
        const on = id === valor;
        return (
          <button key={id} type="button" onClick={() => onCambio(id)} aria-pressed={on}
            className={`${ancho ? 'flex-1' : ''} min-h-[36px] whitespace-nowrap rounded-[8px] px-3 py-1.5 text-apoyo transition-colors ${
              on ? 'bg-white font-bold text-ktext shadow-[0_1px_2px_rgba(20,30,60,.12)]' : 'font-semibold text-kmuted hover:text-ktext'}`}>
            {txt}
          </button>
        );
      })}
    </div>
  );
}

/** Chip redondo que se prende y se apaga (zonas, región, tipo de tienda). */
export function ChipA({
  on, onClick, children, apagado = false, title,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Sin nada que elegir (por ejemplo, una zona sin tiendas ese día): se ve tenue. */
  apagado?: boolean;
  title?: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} title={title}
      className="min-h-[34px] rounded-full px-3 py-1 text-apoyo font-bold transition-colors"
      style={on
        ? { background: '#DDF1EE', color: '#0B5C55', border: '1px solid #9ED3CB' }
        : { background: '#FFFFFF', color: apagado ? '#B8BDC9' : '#5B6170', border: '1px solid #D5D9E3' }}>
      {children}
    </button>
  );
}

/** Rótulo chico arriba de cada grupo de controles. */
export function RotuloA({ children }: { children: ReactNode }) {
  return <span className="text-rotulo font-bold uppercase text-black/60">{children}</span>;
}

/** Tarjeta blanca con el borde y el radio del diseño A. */
export function TarjetaA({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white border border-black/[0.09] rounded-[16px] ${className}`}>{children}</div>;
}
