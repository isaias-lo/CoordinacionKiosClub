'use client';

// Las piezas de la tienda abierta en Bodega, compartidas por Nacional y RM/Costa.
//
// ── POR QUÉ ASÍ ────────────────────────────────────────────────────────────────────────────────
//
// Antes cada unidad era una tarjeta de formulario completa, en dos columnas de ~160 px en el
// teléfono: las pesadas y las por pesar al mismo volumen, todo a 10-11 px. La pantalla contestaba
// "¿cómo registro?" antes de "¿qué me falta?".
//
// Ahora la tienda se lee de arriba abajo:
//   1. La cabecera: cuánto lleva («5 de 8 pesados») y, por tipo, «P 4/5 · B 1/3».
//   2. AHORA: UNA tarjeta abierta, grande — la que se está pesando.
//   3. FALTAN: el resto por pesar, como fichas. Tocar una la abre; escanear también.
//   4. PESADOS: una línea por unidad. El ✎ despliega editar, duplicar, sumar, unificar y borrar.
//
// Agregar una unidad a mano (+ Pallet, + Bulto, …, + Web / retiro) vive en el «+» de la cabecera,
// junto al ⋯. Antes eran dos filas de seis botones al final de la tienda, que en una tienda larga
// quedaban a varios desplazamientos y se confundían con el contenido.
//
// Nacional y RM/Costa usan estas mismas piezas: si cambian, cambian juntas.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal, Pencil, ChevronLeft, Lock, Plus } from 'lucide-react';
import { ESTILO_UNIDAD, LETRA_UNIDAD, type AvanceTienda, type ClaseUnidad } from './unidadVisual';

/** «P1», «B3»: la etiqueta de la unidad, en el color de su tipo. */
export function EtiquetaUnidad({ clase, children, grande }: { clase: ClaseUnidad; children: ReactNode; grande?: boolean }) {
  const e = ESTILO_UNIDAD[clase];
  return (
    <span className={`inline-flex items-center justify-center rounded-md px-2 font-barlow-condensed font-extrabold leading-none flex-shrink-0 ${grande ? 'text-titulo h-8' : 'text-cuerpo h-7'} ${e.texto} ${e.suave}`}>
      {children}
    </span>
  );
}

/** «P 4/5 · B 1/3». Lo pesado en grande; el total en gris, porque es contexto. */
export function ConteoPorTipo({ avance }: { avance: AvanceTienda }) {
  return (
    <span className="inline-flex items-center gap-3 whitespace-nowrap">
      {avance.porTipo.map(t => (
        <span key={t.clase} className="inline-flex items-baseline gap-1">
          <span className={`self-center rounded px-1.5 font-barlow-condensed font-extrabold text-rotulo leading-[18px] ${ESTILO_UNIDAD[t.clase].texto} ${ESTILO_UNIDAD[t.clase].suave}`}>
            {LETRA_UNIDAD[t.clase]}
          </span>
          <span className="font-barlow-condensed font-extrabold text-cuerpo text-text tabular-nums">{t.pesadas}</span>
          <span className="text-apoyo text-text-sub tabular-nums">/{t.total}</span>
        </span>
      ))}
    </span>
  );
}

export function BarraAvance({ pesadas, total }: { pesadas: number; total: number }) {
  const pct = total > 0 ? Math.round((pesadas / total) * 100) : 0;
  return (
    <div className="h-2 rounded-full bg-bg-3 overflow-hidden flex-1 min-w-[60px]" role="progressbar"
      aria-valuemin={0} aria-valuemax={total} aria-valuenow={pesadas} aria-label={`${pesadas} de ${total} pesados`}>
      <div className="h-full bg-est-ok rounded-full transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}

export interface OpcionAgregar {
  /** «Pallet», «Bulto», «Cont.», «Choc.», «Adquisición», «Web / retiro». */
  texto: string;
  /** El color sale del tipo; las que no se pesan van en gris. */
  clase: ClaseUnidad;
  /** Una línea debajo, para las que no son obvias («no se pesa»). */
  detalle?: string;
  onClick: () => void;
}

/**
 * El «+» de la cabecera: abre las unidades que se pueden agregar a mano. Primero las que se pesan
 * (en el color de su tipo), después las que no (adquisición y web/retiro, en gris).
 */
export function MenuAgregar({ opciones, bloqueado }: { opciones: OpcionAgregar[]; bloqueado?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', esc); };
  }, [abierto]);
  useEffect(() => { if (bloqueado) setAbierto(false); }, [bloqueado]);

  const pesables = opciones.filter(o => o.clase !== 'agregado');
  const otras = opciones.filter(o => o.clase === 'agregado');
  const boton = (o: OpcionAgregar) => {
    const e = ESTILO_UNIDAD[o.clase];
    return (
      <button key={o.texto} type="button" onClick={() => { setAbierto(false); o.onClick(); }}
        className={`min-h-[48px] rounded-btn border-[1.5px] px-2 py-1.5 flex flex-col items-start justify-center text-left cursor-pointer active:opacity-80 ${e.borde} ${e.suave}`}>
        <span className={`flex items-center gap-1 text-cuerpo font-bold ${e.texto}`}>
          <Plus size={16} aria-hidden="true" />{o.texto}
        </span>
        {o.detalle && <span className="text-rotulo text-text-sub">{o.detalle}</span>}
      </button>
    );
  };
  return (
    <div ref={caja} className="relative touch-auto flex-shrink-0">
      <button type="button" onClick={() => setAbierto(a => !a)} disabled={bloqueado}
        aria-expanded={abierto} aria-label="Agregar a esta tienda"
        title={bloqueado ? 'Tienda terminada: reábrela para agregar' : 'Agregar pallet, bulto, contenedor, chocolate…'}
        className="w-10 h-10 flex items-center justify-center rounded-btn bg-navy text-white active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed">
        <Plus size={22} aria-hidden="true" />
      </button>
      {abierto && (
        <div className="absolute right-0 top-12 z-30 w-72 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-card shadow-card2 p-2 flex flex-col gap-2">
          <span className="px-1 text-rotulo font-bold uppercase text-text-sub">Agregar</span>
          <div className="grid grid-cols-2 gap-1.5">{pesables.map(boton)}</div>
          {otras.length > 0 && (
            <>
              <span className="px-1 text-rotulo font-bold uppercase text-text-sub">Sin pesar</span>
              <div className="grid grid-cols-2 gap-1.5">{otras.map(boton)}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * La cabecera de la tienda abierta.
 *
 * Clara, no navy: el navy queda para la barra de la app y las acciones. Registrar y Marcar
 * terminada viven en el menú ⋯ para que no compitan con el pesaje; "Marcar terminada" vuelve a
 * aparecer grande al pie cuando ya no falta nada (eso lo decide la pantalla).
 */
export function CabeceraTienda({ nombre, subtitulo, avance, indicador, estado, acciones, agregar, onVolver, arrastre }: {
  nombre: string;
  subtitulo: string;
  avance: AvanceTienda;
  /** El indicador del canal en vivo, o lo que la pantalla quiera junto al nombre. */
  indicador?: ReactNode;
  /** Una ficha de estado visible sin abrir el menú (p. ej. «✓ Terminada»). */
  estado?: ReactNode;
  /** Lo que va dentro del menú ⋯. */
  acciones?: ReactNode;
  /** Las unidades que se pueden agregar a mano: van en el «+», a la izquierda del ⋯. */
  agregar?: { opciones: OpcionAgregar[]; bloqueado?: boolean };
  onVolver?: () => void;
  /** En el teléfono, la cabecera es el asa para arrastrar la hoja hacia abajo. */
  arrastre?: { onTouchStart: (e: React.TouchEvent) => void; onTouchMove: (e: React.TouchEvent) => void; onTouchEnd: () => void };
}) {
  const [menu, setMenu] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const fuera = (e: PointerEvent) => { if (!caja.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [menu]);

  return (
    <div className={`bg-card border-b border-border px-3.5 pt-2 pb-3 flex flex-col gap-2 flex-shrink-0 ${arrastre ? 'touch-none select-none' : ''}`}
      {...arrastre}>
      {arrastre && <span className="w-10 h-1.5 rounded-full bg-border-2 self-center" aria-hidden="true" />}
      <div className="flex items-start gap-2">
        {onVolver && (
          <button type="button" onClick={onVolver} aria-label="Volver a la lista"
            className="touch-auto w-10 h-10 -ml-1 flex items-center justify-center rounded-btn text-text-2 bg-bg-2 active:bg-bg-3 flex-shrink-0">
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-barlow-condensed text-titulo font-extrabold text-text truncate m-0">{nombre}</h2>
            {indicador}
          </div>
          <div className="font-mono text-apoyo text-text-sub truncate">{subtitulo}</div>
        </div>
        {estado}
        {agregar && agregar.opciones.length > 0 && <MenuAgregar {...agregar} />}
        {acciones && (
          <div ref={caja} className="relative touch-auto flex-shrink-0">
            <button type="button" onClick={() => setMenu(m => !m)} aria-expanded={menu} aria-label="Acciones de la tienda"
              className="w-10 h-10 flex items-center justify-center rounded-btn text-text-2 bg-bg-2 active:bg-bg-3">
              <MoreHorizontal size={22} aria-hidden="true" />
            </button>
            {menu && (
              // El clic en una acción cierra el menú; cada acción hace su propia confirmación.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
              <div onClick={() => setMenu(false)}
                className="absolute right-0 top-12 z-30 w-64 bg-card border border-border rounded-card shadow-card2 p-2 flex flex-col gap-1.5">
                {acciones}
              </div>
            )}
          </div>
        )}
      </div>
      {avance.total > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <BarraAvance pesadas={avance.pesadas} total={avance.total} />
          <span className="text-apoyo font-semibold text-text-sub whitespace-nowrap tabular-nums">
            {avance.pesadas} de {avance.total} pesados
          </span>
          <ConteoPorTipo avance={avance} />
        </div>
      )}
    </div>
  );
}

/**
 * Encima de una tienda terminada, que no se puede editar. Si Picking imprimió algo DESPUÉS de
 * terminarla, el aviso pasa a ámbar y ofrece reabrirla ahí mismo: la unidad nueva está adentro,
 * bloqueada, y sin reabrir no hay cómo pesarla.
 */
export function AvisoTiendaTerminada({ nuevas = 0, onReabrir }: { nuevas?: number; onReabrir?: () => void }) {
  if (nuevas > 0) {
    return (
      <div role="alert" className="mx-1 mt-1 mb-2 rounded-card border border-est-aviso bg-est-aviso-suave px-3 py-2.5 flex items-center gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="font-barlow-condensed text-cuerpo font-extrabold uppercase text-est-aviso">
            {nuevas} {nuevas === 1 ? 'unidad nueva' : 'unidades nuevas'} de Picking
          </span>
          <span className="text-apoyo text-text">Llegó después de marcarla terminada. Reábrela para pesarla.</span>
        </div>
        {onReabrir && (
          <button type="button" onClick={onReabrir}
            className="flex-shrink-0 min-h-[44px] px-3 rounded-btn bg-est-aviso text-white text-apoyo font-bold cursor-pointer active:opacity-80">
            Reabrir
          </button>
        )}
      </div>
    );
  }
  return (
    <div role="status" className="mx-1 mt-1 mb-2 rounded-card border border-est-ok bg-est-ok-suave px-3 py-2.5 flex flex-col gap-0.5">
      <span className="font-barlow-condensed text-cuerpo font-extrabold uppercase text-est-ok">✓ Tienda terminada</span>
      <span className="text-apoyo text-text">No se puede editar. Para cambiar algo, reábrela desde el menú ⋯.</span>
    </div>
  );
}

/** «AHORA», «FALTAN 3», «PESADOS 5 · 4.210 kg». */
export function RotuloSeccion({ children, derecha }: { children: ReactNode; derecha?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1 pt-3 pb-1.5">
      <span className="font-barlow-condensed text-rotulo font-bold uppercase text-text-sub">{children}</span>
      {derecha && <span className="text-rotulo font-semibold text-text-sub tabular-nums">{derecha}</span>}
    </div>
  );
}

/**
 * Tienda sin ninguna unidad: Picking todavía no armó nada para ella. Antes el cuerpo quedaba en
 * blanco bajo el cruce y no se sabía si estaba cargando, si falló o si de verdad no había nada.
 */
export function TiendaSinUnidades() {
  return (
    <div className="mx-1 mt-3 rounded-xl border border-dashed border-border px-4 py-6 text-center">
      <div className="font-bold text-text">Esta tienda no tiene unidades de Picking</div>
      <div className="mt-1 text-apoyo text-text-sub">Escanea una etiqueta o agrega una unidad con el botón +.</div>
    </div>
  );
}

/** La tarjeta que se está pesando. Los atributos `data-*` los usa el lector (useLectorBodega). */
export function TarjetaActiva({ clase, slotId, resaltada, children }: {
  clase: ClaseUnidad;
  slotId?: number;
  resaltada?: boolean;
  children: ReactNode;
}) {
  return (
    <div id={slotId != null ? `pallet-card-${slotId}` : undefined}
      data-tarjeta-bodega="" data-slot={slotId ?? undefined}
      className={`relative bg-card rounded-kios border-2 p-3 flex flex-col gap-2.5 shadow-kios ${ESTILO_UNIDAD[clase].borde} ${resaltada ? 'tarjeta-escaneada' : ''}`}>
      {children}
    </div>
  );
}

export interface FichaPendiente {
  id: string;
  clase: ClaseUnidad;
  etiqueta: string;
  slotId?: number;
  /** Tiene datos escritos sin guardar. */
  aMedias?: boolean;
}

/** Lo que falta pesar, fuera de la tarjeta abierta. Tocar una ficha la abre. */
export function ColaPendientes({ fichas, onElegir }: { fichas: FichaPendiente[]; onElegir: (id: string) => void }) {
  if (!fichas.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {fichas.map(f => (
        <button key={f.id} type="button" onClick={() => onElegir(f.id)}
          className="min-h-[44px] inline-flex items-center gap-2 pl-1.5 pr-3 rounded-btn border-[1.5px] border-dashed border-border-2 bg-card active:bg-bg-2">
          <EtiquetaUnidad clase={f.clase}>{f.etiqueta}</EtiquetaUnidad>
          {f.slotId != null && <span className="font-mono text-apoyo text-text">#{f.slotId}</span>}
          {f.aMedias && <span className="text-rotulo font-bold uppercase text-est-aviso">a medias</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * Una unidad ya pesada, en una línea. El ✎ despliega sus acciones (`children`).
 *
 * Recién escaneada (`resaltada`) y con `campos`, se muestra como la tarjeta grande pero celeste y
 * bloqueada: se ve lo guardado, no se puede escribir, y Editar (que pide confirmar) es la salida.
 */
export function FilaPesada({ clase, etiqueta, slotId, resumen, detalle, aviso, resaltada, seleccion, campos, children }: {
  clase: ClaseUnidad;
  etiqueta: string;
  slotId?: number;
  /** «498 kg · 150 cm». */
  resumen: ReactNode;
  /** «Comida», «60×40 cm», quién lo armó. */
  detalle?: ReactNode;
  /** Ficha de aviso, p. ej. «sin pesar». */
  aviso?: ReactNode;
  resaltada?: boolean;
  /** La casilla de «sumar en masa», cuando aplica. */
  seleccion?: ReactNode;
  /** Lo guardado, campo por campo, para la vista grande. */
  campos?: { rotulo: string; valor: string }[];
  children?: ReactNode;
}) {
  const [abierta, setAbierta] = useState(false);
  if (resaltada && campos && campos.length > 0) {
    return (
      <div id={slotId != null ? `pallet-card-${slotId}` : undefined}
        className="relative tarjeta-escaneada bg-sky-500/10 border-2 border-sky-500 rounded-kios px-3 py-3 m-1 flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          {seleccion}
          <EtiquetaUnidad clase={clase} grande>{etiqueta}</EtiquetaUnidad>
          {slotId != null && <span className="font-mono text-apoyo text-text-sub">#{slotId}</span>}
          {aviso}
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-sky-600 text-white px-2.5 py-1 text-rotulo font-bold uppercase">
            <Lock size={12} aria-hidden="true" /> Guardado
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {campos.map(c => (
            <div key={c.rotulo} className="rounded-btn border border-sky-500/40 bg-card/70 px-3 py-2">
              <div className="text-rotulo font-bold uppercase text-text-sub">{c.rotulo}</div>
              <div className="font-barlow-condensed text-cifra font-extrabold text-text tabular-nums leading-tight">{c.valor}</div>
            </div>
          ))}
        </div>
        {detalle && <div className="text-apoyo text-text-sub">{detalle}</div>}
        {children && <div className="flex flex-col gap-2">{children}</div>}
      </div>
    );
  }
  return (
    <div id={slotId != null ? `pallet-card-${slotId}` : undefined}
      className={`bg-card ${resaltada ? 'relative tarjeta-escaneada' : ''}`}>
      <div className="flex items-center gap-2.5 px-3 py-2 min-h-[52px]">
        {seleccion}
        <EtiquetaUnidad clase={clase}>{etiqueta}</EtiquetaUnidad>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-cuerpo font-semibold text-text tabular-nums">{resumen}</span>
            {aviso}
          </div>
          {(detalle || slotId != null) && (
            <div className="text-apoyo text-text-sub truncate">
              {slotId != null && <span className="font-mono">#{slotId}</span>}
              {slotId != null && detalle ? ' · ' : ''}
              {detalle}
            </div>
          )}
        </div>
        {children && (
          <button type="button" onClick={() => setAbierta(a => !a)} aria-expanded={abierta}
            aria-label={`Acciones de ${etiqueta}`}
            className={`w-11 h-11 flex items-center justify-center rounded-btn flex-shrink-0 ${abierta ? 'bg-navy text-white' : 'bg-bg-2 text-text-2 active:bg-bg-3'}`}>
            <Pencil size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      {abierta && children && (
        <div className="px-3 pb-3 flex flex-col gap-2">{children}</div>
      )}
    </div>
  );
}

/** Botón de acción dentro de una fila desplegada o del menú ⋯. */
export function BotonAccion({ onClick, children, tono = 'normal', title, disabled }: {
  onClick: () => void;
  children: ReactNode;
  tono?: 'normal' | 'peligro' | 'principal';
  title?: string;
  disabled?: boolean;
}) {
  const cls = tono === 'peligro'
    ? 'text-est-error border-border bg-card'
    : tono === 'principal'
      ? 'text-white border-navy bg-navy'
      : 'text-text border-border bg-card';
  return (
    <button type="button" onClick={onClick} title={title} disabled={disabled}
      className={`min-h-[44px] px-3 rounded-btn border font-barlow-condensed text-cuerpo font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-40 ${cls}`}>
      {children}
    </button>
  );
}
