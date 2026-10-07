'use client';

// El «Resumen del día» de Bodega, compartido por Nacional y RM/Costa.
//
// ── POR QUÉ ASÍ ────────────────────────────────────────────────────────────────────────────────
//
// El resumen era lo último que quedaba con la cara de antes: franja navy con números de colores
// sueltos («19 P · 14 B»), acordeón de filas a 10-13 px, «12P 3B» en píldoras y tres botones de
// 11 px por unidad. No se parecía a la lista de tiendas ni a la tienda abierta, y los números de
// arriba no cuadraban con los de la lista (contaba contenedores y adquisiciones como bultos).
//
// Ahora:
//   1. Cabecera clara: título, fecha y una fila de cifras por tipo (en el color de su tipo), más
//      los kilos y el monto del día. Debajo, cuántas tiendas de hoy están listas.
//   2. Una fila por tienda con el mismo lenguaje que la lista: código, nombre, «✓ Terminada» o
//      «En curso», conteo por tipo y kilos. Tocarla despliega sus unidades.
//   3. Cada unidad en una línea: su etiqueta en el color del tipo, el peso en cifra grande y las
//      acciones como botones de 40 px. Una tienda terminada muestra el candado y no deja tocar.

import type { HTMLAttributes, ReactNode } from 'react';
import { Check, ChevronDown, Copy, Lock, Pencil, Trash2 } from 'lucide-react';
import { EtiquetaUnidad } from './TiendaAbierta';
import { ESTILO_UNIDAD, LETRA_UNIDAD, type ClaseUnidad } from './unidadVisual';
import { formatCLP, formatCLPCorto } from './formatoCLP';
import { formatoKg, textoAvanceTiendas, type TotalesResumen } from './resumenDia';

type Pesable = Exclude<ClaseUnidad, 'agregado'>;
const NOMBRE_KPI: Record<Pesable, string> = { pallet: 'Pallets', bulto: 'Bultos', contenedor: 'Cont.', chocolate: 'Choc.' };
const ORDEN: Pesable[] = ['pallet', 'bulto', 'contenedor', 'chocolate'];

/** «P 12 · B 4»: solo los tipos que hay. */
export function ConteoUnidades({ totales }: { totales: Pick<TotalesResumen, Pesable | 'agregado'> }) {
  const hay = ORDEN.filter(c => totales[c] > 0);
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
      {hay.map(c => (
        <span key={c} className="inline-flex items-center gap-1">
          <span className={`rounded px-1.5 font-barlow-condensed font-extrabold text-rotulo leading-[18px] ${ESTILO_UNIDAD[c].texto} ${ESTILO_UNIDAD[c].suave}`}>
            {LETRA_UNIDAD[c]}
          </span>
          <span className="font-barlow-condensed font-extrabold text-cuerpo text-text tabular-nums">{totales[c]}</span>
        </span>
      ))}
      {totales.agregado > 0 && (
        <span className="text-apoyo text-text-sub tabular-nums" title="Adquisiciones y web/retiro: no se pesan">+{totales.agregado} sin pesar</span>
      )}
    </span>
  );
}

/**
 * Lo de arriba del resumen. `herramientas` va a la derecha del título (Traer Odoo, seleccionar
 * todo, ver todo); `volver` aparece solo en el teléfono, donde el resumen ocupa la pantalla.
 */
export function CabeceraResumen({ totales, tiendas, avance, herramientas, volver }: {
  totales: TotalesResumen;
  /** Tiendas con carga. */
  tiendas: number;
  /** Tiendas de hoy marcadas terminadas, sobre las de hoy. */
  avance?: { listas: number; total: number };
  herramientas?: ReactNode;
  volver?: ReactNode;
}) {
  const fecha = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  // Las unidades en baldosas, en el color de su tipo; tiendas, kilos y monto en una línea
  // debajo: son números largos («4.210,5») que en una baldosa angosta se cortaban.
  const tiles = ORDEN.filter(c => c === 'pallet' || c === 'bulto' || totales[c] > 0);
  const pct = avance && avance.total > 0 ? Math.round((avance.listas / avance.total) * 100) : 0;
  return (
    <div className="bg-card border-b border-border px-3.5 pt-3 pb-3 flex flex-col gap-3 flex-shrink-0">
      <div className="flex items-center gap-2">
        {volver}
        <div className="flex-1 min-w-0">
          <h2 className="font-barlow-condensed text-titulo font-extrabold text-text m-0 leading-tight">Resumen del día</h2>
          <div className="text-apoyo text-text-sub first-letter:uppercase truncate">{fecha}</div>
        </div>
        {herramientas && <div className="flex items-center gap-1.5 flex-shrink-0">{herramientas}</div>}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(4.25rem,1fr))] gap-1.5">
        {tiles.map(c => (
          <div key={c} className={`rounded-btn px-2.5 py-1.5 flex flex-col gap-0.5 min-w-0 ${ESTILO_UNIDAD[c].suave}`}>
            <span className={`font-barlow-condensed text-cifra font-extrabold leading-none tabular-nums ${ESTILO_UNIDAD[c].texto}`}>{totales[c]}</span>
            <span className="text-rotulo font-bold uppercase text-text-sub">{NOMBRE_KPI[c]}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="whitespace-nowrap">
          <span className="font-barlow-condensed text-titulo font-extrabold text-text tabular-nums">{formatoKg(totales.kg)}</span>
        </span>
        <span className="text-apoyo text-text-sub whitespace-nowrap tabular-nums">
          {tiendas} {tiendas === 1 ? 'tienda' : 'tiendas'} con carga
        </span>
        {totales.agregado > 0 && (
          <span className="text-apoyo text-text-sub whitespace-nowrap tabular-nums">+{totales.agregado} sin pesar</span>
        )}
        {totales.monto > 0 && (
          <span className="text-apoyo font-semibold text-text-2 whitespace-nowrap tabular-nums" title={formatCLP(totales.monto)}>{formatCLPCorto(totales.monto)}</span>
        )}
      </div>
      {avance && avance.total > 0 && (
        <div className="flex items-center gap-3">
          <div className="h-2 rounded-full bg-bg-3 overflow-hidden flex-1" role="progressbar"
            aria-valuemin={0} aria-valuemax={avance.total} aria-valuenow={avance.listas} aria-label={textoAvanceTiendas(avance.listas, avance.total)}>
            <div className="h-full bg-est-ok rounded-full transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          <span className={`text-apoyo font-semibold whitespace-nowrap ${avance.listas >= avance.total ? 'text-est-ok' : 'text-text-sub'}`}>
            {avance.listas >= avance.total ? '✓ ' : ''}{textoAvanceTiendas(avance.listas, avance.total)}
          </span>
        </div>
      )}
    </div>
  );
}

/** Un botón chico de la cabecera del resumen («Ver todo», «Seleccionar todo»). */
export function BotonHerramienta({ children, onClick, title, activo }: { children: ReactNode; onClick: () => void; title?: string; activo?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={activo}
      className={`min-h-[36px] px-2.5 rounded-btn text-apoyo font-bold cursor-pointer whitespace-nowrap active:opacity-80 ${activo ? 'bg-navy text-white' : 'bg-bg-2 text-text-2'}`}>
      {children}
    </button>
  );
}

/** La fila de una tienda en el resumen. Toca para desplegar sus unidades. */
export function FilaResumenTienda({ cod, nombre, sub, totales, terminada, abierta, seleccion, onToggle, children }: {
  cod: string;
  nombre: string;
  sub?: string;
  totales: TotalesResumen;
  terminada: boolean;
  abierta: boolean;
  /** Cuántas unidades están marcadas para exportar (solo Nacional). */
  seleccion?: { n: number; total: number };
  onToggle: () => void;
  /** Lo desplegado. */
  children?: ReactNode;
}) {
  return (
    <div className={`border-b border-border ${abierta ? 'bg-card' : ''}`}>
      <button type="button" onClick={onToggle} aria-expanded={abierta}
        className={`w-full grid grid-cols-[52px_1fr_auto] gap-x-2.5 gap-y-1 items-center px-3.5 py-2.5 text-left cursor-pointer select-none transition-colors ${
          abierta ? 'bg-navy/[0.07] shadow-[inset_4px_0_0_theme(colors.navy.DEFAULT)]'
          : terminada ? 'bg-est-ok-suave shadow-[inset_4px_0_0_var(--est-ok)] active:bg-bg-2' : 'bg-card active:bg-bg-2'}`}>
        <span className="row-span-2 font-barlow-condensed text-titulo font-extrabold text-navy text-center tabular-nums">{cod}</span>
        <span className="min-w-0">
          <span className="block font-semibold text-cuerpo text-text truncate">{nombre}</span>
          {sub && <span className="block text-apoyo text-text-sub truncate">{sub}</span>}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`text-rotulo font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${terminada ? 'text-est-ok bg-est-ok-suave' : 'text-navy bg-navy/[0.08]'}`}>
            {terminada ? '✓ Terminada' : 'En curso'}
          </span>
          <ChevronDown size={18} aria-hidden="true" className={`text-text-sub transition-transform ${abierta ? 'rotate-180' : ''}`} />
        </span>
        <span className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-apoyo text-text-sub">
          <ConteoUnidades totales={totales} />
          <span className="font-semibold text-text-2 tabular-nums">{formatoKg(totales.kg)}</span>
          {totales.monto > 0 && <span className="tabular-nums" title={formatCLP(totales.monto)}>{formatCLPCorto(totales.monto)}</span>}
          {seleccion && seleccion.n > 0 && (
            <span className="text-rotulo font-bold text-est-ok bg-est-ok-suave px-1.5 rounded-full tabular-nums">✓ {seleccion.n}/{seleccion.total}</span>
          )}
        </span>
      </button>
      {abierta && children}
    </div>
  );
}

/** Encima de las unidades de una tienda terminada: por qué no se pueden tocar. */
export function AvisoResumenTerminada() {
  return (
    <div className="mx-3 my-2 flex items-center gap-2 rounded-btn bg-est-ok-suave text-est-ok px-2.5 py-2 text-apoyo font-semibold">
      <Lock size={14} aria-hidden="true" className="flex-shrink-0" />
      Terminada: para cambiar algo, reábrela desde la tienda.
    </div>
  );
}

const BOTON_ACCION = 'w-10 h-10 flex items-center justify-center rounded-btn bg-bg-2 text-text-2 active:bg-bg-3 cursor-pointer flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed';

/**
 * Una unidad del resumen. Los `HTMLAttributes` pasan derecho al contenedor: el arrastrar para
 * combinar (mouse y toque) lo maneja cada pantalla.
 */
export function UnidadResumen({ clase, etiqueta, peso, detalle, seleccion, bloqueada, resaltada, apagada, onEditar, onCopiar, onEliminar, ...resto }: {
  clase: ClaseUnidad;
  etiqueta: string;
  /** «300 kg», o lo que diga la unidad si no se pesa («Adquisición»). */
  peso: string;
  /** Contenido, medidas, guía, estado: la segunda línea. */
  detalle?: string;
  /** Marcada para exportar (solo Nacional). */
  seleccion?: { activa: boolean; onToggle: () => void };
  bloqueada?: boolean;
  /** Es el destino de un arrastre. */
  resaltada?: boolean;
  /** Es la que se está arrastrando. */
  apagada?: boolean;
  onEditar?: () => void;
  onCopiar?: () => void;
  onEliminar?: () => void;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>) {
  return (
    <div {...resto}
      className={`flex items-center gap-2.5 pl-3.5 pr-2 py-2 border-t border-border/60 select-none transition-colors ${
        resaltada ? 'bg-est-ok-suave shadow-[inset_4px_0_0_var(--est-ok)]' : seleccion?.activa ? 'bg-est-ok-suave' : 'bg-card'} ${apagada ? 'opacity-40' : ''} ${resto.className ?? ''}`}>
      {seleccion && (
        <button type="button" role="checkbox" aria-checked={seleccion.activa} aria-label={`Exportar ${etiqueta}`}
          onClick={e => { e.stopPropagation(); seleccion.onToggle(); }}
          className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 cursor-pointer ${seleccion.activa ? 'bg-est-ok border-est-ok text-white' : 'border-border-2 bg-card'}`}>
          {seleccion.activa && <Check size={14} aria-hidden="true" />}
        </button>
      )}
      <EtiquetaUnidad clase={clase}>{etiqueta}</EtiquetaUnidad>
      <div className="flex-1 min-w-0">
        <div className="font-barlow-condensed text-cuerpo font-extrabold text-text tabular-nums leading-tight">{peso}</div>
        {detalle && <div className="text-apoyo text-text-sub truncate">{detalle}</div>}
      </div>
      {bloqueada ? (
        <Lock size={16} aria-label="Tienda terminada" className="text-text-sub flex-shrink-0 mx-3" />
      ) : (
        <div className="flex items-center gap-1 flex-shrink-0">
          {onEditar && (
            <button type="button" onClick={e => { e.stopPropagation(); onEditar(); }} aria-label={`Editar ${etiqueta}`} title="Editar" className={BOTON_ACCION}>
              <Pencil size={16} aria-hidden="true" />
            </button>
          )}
          {onCopiar && (
            <button type="button" onClick={e => { e.stopPropagation(); onCopiar(); }} aria-label={`Copiar ${etiqueta} a otras tiendas`} title="Copiar a otras tiendas" className={BOTON_ACCION}>
              <Copy size={16} aria-hidden="true" />
            </button>
          )}
          {onEliminar && (
            <button type="button" onClick={e => { e.stopPropagation(); onEliminar(); }} aria-label={`Eliminar ${etiqueta}`} title="Eliminar"
              className={`${BOTON_ACCION} active:text-est-error`}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Cuando no hay nada cargado todavía. */
export function ResumenVacio() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-1 py-12 px-6 text-center">
      <span className="font-barlow-condensed text-titulo font-extrabold text-text-sub">Todavía no hay carga</span>
      <span className="text-apoyo text-text-sub">Lo que se pese en las tiendas aparece acá, tienda por tienda.</span>
    </div>
  );
}
