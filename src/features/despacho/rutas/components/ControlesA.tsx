'use client';

// [Vista nueva] Piezas chicas con el lenguaje del diseño A, compartidas por las secciones del
// Enrutador (Plan, Flota y lo que venga): selector gris con la opción elegida en blanco, chips
// redondos, tarjetas blancas, campos y botones del mismo tamaño en todas partes. Así cada sección
// no vuelve a inventar su botón y su input, y un ajuste de estilo se hace una sola vez acá.
// Solo presentación: cada pieza recibe el valor y avisa el cambio, sin estado propio.

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export const ACENTO_PLAN = '#0F766E';
export const ACENTO_FLOTA = '#1B2A6B';

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
            className={`${ancho ? 'flex-1' : ''} min-h-[36px] whitespace-nowrap rounded-[8px] px-3 py-1.5 text-apoyo transition-colors inline-flex items-center justify-center gap-1.5 ${
              on ? 'bg-white font-bold text-ktext shadow-[0_1px_2px_rgba(20,30,60,.12)]' : 'font-semibold text-kmuted hover:text-ktext'}`}>
            {txt}
          </button>
        );
      })}
    </div>
  );
}

// Colores del chip prendido. Plan usa el verde azulado de su acento; Flota, el azul de la marca.
const TONOS_CHIP = {
  teal: { background: '#DDF1EE', color: '#0B5C55', border: '1px solid #9ED3CB' },
  azul: { background: '#E4E8F5', color: '#1B2A6B', border: '1px solid #AEB8DA' },
  morado: { background: '#F1E8FA', color: '#6B21A8', border: '1px solid #D3B8EC' },
} as const;

/** Chip redondo que se prende y se apaga (zonas, región, tipo de tienda, empresa). */
export function ChipA({
  on, onClick, children, apagado = false, title, tono = 'teal',
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Sin nada que elegir (por ejemplo, una zona sin tiendas ese día): se ve tenue. */
  apagado?: boolean;
  title?: string;
  tono?: keyof typeof TONOS_CHIP;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} title={title}
      className="min-h-[34px] rounded-full px-3 py-1 text-apoyo font-bold transition-colors inline-flex items-center gap-1.5"
      style={on
        ? TONOS_CHIP[tono]
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

/** Cabecera de una tarjeta: título, un dato al lado y, a la derecha, sus acciones. */
export function CabeceraA({ titulo, detalle, children }: { titulo: ReactNode; detalle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="px-4 pt-3.5 pb-3 border-b border-black/[0.07] flex items-center gap-x-3 gap-y-2 flex-wrap">
      <span className="flex items-baseline gap-x-2 flex-wrap flex-1 min-w-[150px]">
        <span className="text-cuerpo font-bold text-ktext">{titulo}</span>
        {detalle != null && <span className="text-apoyo text-kmuted whitespace-nowrap">{detalle}</span>}
      </span>
      {children}
    </div>
  );
}

/** Fila de títulos de una tabla A (la misma de «Quién maneja»). */
export const ENCABEZADO_TABLA_A = 'text-rotulo font-bold uppercase text-black/60 bg-[#F7F8FA] border-b border-black/[0.07]';

/** Clase de inputs, selects y textareas A: 40 px de alto mínimo, texto de 14 px, borde suave. */
export const INPUT_A = 'w-full min-w-0 rounded-[10px] border border-black/[0.12] px-3 py-2 min-h-[40px] text-apoyo bg-white text-ktext outline-none focus:border-knavy placeholder:text-kmuted';

/** Un campo con su rótulo encima. */
export function CampoA({ etiqueta, children, className = '' }: { etiqueta: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 min-w-0 ${className}`}>
      <RotuloA>{etiqueta}</RotuloA>
      {children}
    </label>
  );
}

const VARIANTES_BOTON = {
  primario: 'text-white disabled:opacity-40',
  secundario: 'bg-white border border-black/[0.12] text-ktext hover:border-black/25 disabled:opacity-40',
  suave: 'text-kmuted hover:text-ktext disabled:opacity-40',
  peligro: 'text-white bg-[#D42B2B] disabled:opacity-40',
} as const;

/** Botón A. El primario toma el color de la sección (`color`); el resto es neutro. */
export function BotonA({
  variante = 'secundario', color = ACENTO_FLOTA, className = '', style, children, ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: keyof typeof VARIANTES_BOTON; color?: string }) {
  return (
    <button type="button" {...resto}
      className={`min-h-[40px] rounded-[10px] px-4 py-2 text-apoyo font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${VARIANTES_BOTON[variante]} ${className}`}
      style={variante === 'primario' ? { background: color, ...style } : style}>
      {children}
    </button>
  );
}

/** Botón cuadrado con solo un ícono (editar, borrar). Siempre lleva `aria-label`. */
export function BotonIconoA({
  peligro = false, activo = false, className = '', children, ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { 'aria-label': string; peligro?: boolean; activo?: boolean }) {
  return (
    <button type="button" {...resto}
      className={`w-9 h-9 flex-shrink-0 rounded-[9px] border inline-flex items-center justify-center transition-colors ${
        activo ? 'border-knavy/40 text-knavy bg-knavy/[0.07]'
          : peligro ? 'border-black/[0.10] text-kmuted hover:border-[#D42B2B]/40 hover:text-[#D42B2B]'
          : 'border-black/[0.10] text-kmuted hover:border-knavy/40 hover:text-knavy'} ${className}`}>
      {children}
    </button>
  );
}

/** Interruptor encendido/apagado (vehículos de hoy). */
export function InterruptorA({ on, onCambio, etiqueta }: { on: boolean; onCambio: () => void; etiqueta: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={etiqueta} onClick={onCambio}
      className={`w-[42px] h-6 rounded-full p-[3px] flex flex-shrink-0 transition-colors ${on ? 'bg-knavy justify-end' : 'bg-black/[0.18] justify-start'}`}>
      <span className="w-[18px] h-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
    </button>
  );
}

/** Etiqueta chica de una característica (portón, frío, 2ª vuelta). */
export function EtiquetaA({ children, color = '#5B6170', fondo = '#F1F2F6' }: { children: ReactNode; color?: string; fondo?: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-rotulo font-bold tracking-normal" style={{ color, background: fondo }}>
      {children}
    </span>
  );
}

/** Aviso de una línea dentro de una tarjeta: verde si salió bien, rojo si no. */
export function AvisoA({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <p role="status" className="text-apoyo font-semibold" style={{ color: ok ? '#11622F' : '#B42318' }}>{children}</p>;
}
