'use client';

// La lista de tiendas de Bodega, compartida por Nacional y RM/Costa.
//
// ── POR QUÉ ASÍ ────────────────────────────────────────────────────────────────────────────────
//
// Antes cada tienda era una baldosa de ~160 px en dos columnas: el código, el nombre cortado en
// dos líneas y una fila de insignias punteadas y llenas («2P 1P 4B»). «Buenaventura» y
// «Buenaventura II» se confundían, y para saber cuánto le faltaba a una tienda había que sumar
// insignias de cabeza.
//
// Ahora:
//   1. La barra del día, en una línea: «4/11 listas» y los tres estados con su conteo, que son
//      también los filtros. Las unidades del día van en el rótulo «Hoy».
//   3. «Hoy» en Mosaico (`BaldosaTienda`): anillo de avance con el código, nombre completo y el
//      detalle en palabras. «Todas» sigue en filas (`FilaTienda`). Las dos reciben las mismas props.
//   4. El pie: «Resumen» y un menú ⋯ con lo demás.
//
// Retirar una tienda de hoy pasó al menú ⋯ («Editar tiendas de hoy»): la × en cada baldosa se
// tocaba sin querer. Agregar sigue a mano en «Todas», que es para eso.
//
// La lógica (estado, avance, filtros) vive en `listaTiendas.ts`, sin React.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal, Plus, X } from 'lucide-react';
import { ESTILO_UNIDAD, type AvanceTienda } from './unidadVisual';
import { BarraAvance, ConteoPorTipo } from './TiendaAbierta';
import { PresenciaBadge } from './PresenciaBadge';
import { StoreProgressBar } from './StoreProgressBar';
import type { ViendoInfo } from './usePresenciaTienda';
import { chipFila, type EstadoLista, type FiltroLista, type ResumenDia, type TonoChip } from './listaTiendas';
import { agregadosBaldosa, ariaBaldosa, detalleBaldosa, pctAnillo, pctOdoo } from './baldosaTienda';

const TONO_CHIP: Record<TonoChip, string> = {
  ok:      'text-est-ok bg-est-ok-suave',
  aviso:   'text-est-aviso bg-est-aviso-suave',
  curso:   'text-navy bg-navy/[0.08]',
  apagado: 'text-text-sub bg-bg-2',
};

export interface FilaTiendaProps {
  cod: string;
  nombre: string;
  /** Mall / Strip / Tienda, ya resuelto con `tipoBadge`. */
  tipo?: { label: string; bg: string; color: string } | null;
  estado: EstadoLista;
  activa: boolean;
  conGuia: boolean;
  avance: AvanceTienda;
  /** Adquisiciones y web/retiro: no se pesan, pero existen y hay que verlas. */
  agregados?: { adquisicion: number; webRetiro: number };
  sinPesar: number;
  /** Movimientos de Odoo (seco). Sin movimientos, no se dibuja. */
  odoo?: { done: number; total: number };
  viendo?: ViendoInfo[];
  onSelect: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  accion?: { tipo: 'agregar' | 'retirar'; onClick: () => void };
  /** «Hoy» va en baldosas (Mosaico); «Todas» sigue en filas. Mismas props, misma conducta. */
  forma?: 'fila' | 'baldosa';
}

/**
 * Fondo y franja izquierda de la fila: se reconoce de lejos qué tiendas están listas (verde) y
 * cuáles ya tienen guía (celeste). La abierta manda sobre las dos.
 */
function claseFila(activa: boolean, estado: EstadoLista, conGuia: boolean): string {
  if (activa) return 'bg-navy/[0.07] shadow-[inset_4px_0_0_theme(colors.navy.DEFAULT)]';
  if (estado === 'lista') return 'bg-est-ok-suave shadow-[inset_4px_0_0_var(--est-ok)] active:bg-bg-2';
  if (conGuia) return 'bg-sky-500/10 shadow-[inset_4px_0_0_theme(colors.sky.500)] active:bg-bg-2';
  return 'bg-card active:bg-bg-2';
}

const CLASE_LETRA: Record<string, 'pallet' | 'bulto' | 'contenedor' | 'chocolate'> = {
  P: 'pallet', B: 'bulto', C: 'contenedor', CH: 'chocolate',
};

export function FilaTienda(props: FilaTiendaProps) {
  if (props.forma === 'baldosa') return <BaldosaTienda {...props} />;
  const { cod, nombre, tipo, estado, activa, conGuia, avance, agregados, sinPesar, odoo, viendo, onSelect, onDragStart, accion } = props;
  const chip = chipFila({ estado, sinPesar, conGuia });
  const otros = agregados ? [
    agregados.adquisicion > 0 && { letra: 'A', n: agregados.adquisicion, titulo: 'Adquisiciones: no se pesan' },
    agregados.webRetiro > 0 && { letra: 'W', n: agregados.webRetiro, titulo: 'Web / retiro: no se pesan' },
  ].filter(Boolean) as { letra: string; n: number; titulo: string }[] : [];
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      className={`relative flex items-stretch border-b border-border transition-colors ${claseFila(activa, estado, conGuia)}`}>
      <button type="button" onClick={onSelect} aria-current={activa ? 'true' : undefined}
        className="flex-1 min-w-0 grid grid-cols-[52px_1fr_auto] gap-x-2.5 gap-y-1 items-center px-3.5 py-2.5 text-left cursor-pointer select-none">
        <span className="row-span-2 relative font-barlow-condensed text-titulo font-extrabold text-navy text-center tabular-nums">
          <PresenciaBadge viendo={viendo} />
          {cod}
        </span>
        <span className="min-w-0 flex items-center gap-1.5">
          <span className="font-semibold text-cuerpo text-text truncate" title={nombre}>{nombre}</span>
          {tipo && (
            <span className="flex-shrink-0 text-rotulo font-extrabold uppercase px-1.5 rounded-full" style={{ background: tipo.bg, color: tipo.color }}>
              {tipo.label}
            </span>
          )}
        </span>
        <span className={`text-rotulo font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${TONO_CHIP[chip.tono]}`}>
          {chip.texto}
        </span>
        <span className="col-span-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0 text-apoyo text-text-sub">
          {avance.total > 0
            ? <><BarraAvance pesadas={avance.pesadas} total={avance.total} /><ConteoPorTipo avance={avance} /></>
            : <span className="flex-1">Sin unidades</span>}
          {otros.map(o => (
            <span key={o.letra} title={o.titulo} className="whitespace-nowrap tabular-nums">
              <span className="font-barlow-condensed font-extrabold text-text-2">{o.letra}</span> {o.n}
            </span>
          ))}
          {conGuia && estado !== 'lista' && (
            <span className="text-rotulo font-bold uppercase px-1.5 rounded-full bg-sky-600 text-white whitespace-nowrap" title="Ya tiene su guía">Guía</span>
          )}
        </span>
        {odoo && odoo.total > 0 && (
          <span className="col-start-2 col-span-2 flex items-center gap-2 text-rotulo text-text-sub" title="Movimientos de Odoo realizados">
            <span className="uppercase font-bold">Odoo</span>
            <StoreProgressBar total={odoo.total} done={odoo.done} variant="list" showCount />
          </span>
        )}
      </button>
      {accion && (
        <button type="button" onClick={accion.onClick}
          aria-label={accion.tipo === 'agregar' ? `Agregar ${nombre} a hoy` : `Retirar ${nombre} de hoy`}
          className={`flex-shrink-0 w-12 flex items-center justify-center border-l border-border cursor-pointer ${accion.tipo === 'agregar' ? 'text-est-ok active:bg-est-ok-suave' : 'text-est-aviso active:bg-est-aviso-suave'}`}>
          {accion.tipo === 'agregar' ? <Plus size={20} aria-hidden="true" /> : <X size={20} aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}

// ── MOSAICO ────────────────────────────────────────────────────────────────────────────────
//
// «Hoy» en baldosas de tres columnas en el teléfono, para ver un día de ~11 tiendas casi sin
// desplazar. Cada baldosa: un anillo con lo pesado sobre el total y el código adentro, el nombre
// COMPLETO (hasta dos líneas: «Buenaventura» y «Buenaventura II» se confundían cuando se cortaba)
// y el detalle en palabras. Estado y avance salen de `listaTiendas.ts`, igual que en la fila.

const CAJA_BALDOSA: Record<EstadoLista, string> = {
  lista:     'border border-est-ok bg-est-ok-suave',
  curso:     'border border-border bg-card',
  pendiente: 'border-[1.5px] border-dashed border-border-2 bg-card',
};

/** El color del anillo, como variable: el porcentaje va en `style` y no hay hex sueltos. */
const ANILLO: Record<EstadoLista, string> = {
  lista:     '[--anillo:var(--est-ok)]',
  curso:     '[--anillo:theme(colors.navy.DEFAULT)]',
  pendiente: 'bg-bg-3',
};

const DETALLE_BALDOSA: Record<EstadoLista, string> = {
  lista:     'text-est-ok',
  curso:     'text-navy',
  pendiente: 'text-text-sub',
};

/** La grilla de «Hoy»: tres columnas en el teléfono; desde `md`, las que quepan. */
export const GRILLA_MOSAICO = 'grid grid-cols-3 md:grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2 px-2.5 py-2';

/** El centro del anillo: la sigla grande y el número chico debajo. */
function Centro({ sigla, numero, chico = false }: { sigla: string; numero: string; chico?: boolean }) {
  return (
    <span className={`${chico ? 'w-[40px] h-[40px]' : 'w-[48px] h-[48px]'} rounded-full bg-card flex flex-col items-center justify-center leading-none gap-0.5`}>
      <span className="font-barlow-condensed text-cuerpo font-extrabold text-navy">{sigla}</span>
      {numero && <span className="text-rotulo text-text-sub tabular-nums">{numero}</span>}
    </span>
  );
}

export function BaldosaTienda({ cod, nombre, tipo, estado, activa, conGuia, avance, agregados, sinPesar, odoo, viendo, onSelect, onDragStart, accion }: FilaTiendaProps) {
  const chip = chipFila({ estado, sinPesar, conGuia });
  const pct = pctAnillo(estado, avance);
  // `formatCod` deja «53 VAL»: las letras distinguen la tienda, el número va chico debajo.
  const [primero, ...resto] = cod.split(' ');
  const sigla = resto.length ? resto.join(' ') : cod;
  const numero = resto.length ? primero : '';
  const otros = agregadosBaldosa(agregados);
  const aviso = chip.tono === 'aviso' ? chip.texto : null;
  const conOdoo = !!odoo && odoo.total > 0;
  const odooPct = pctOdoo(odoo);
  const odooListo = odooPct === 100;
  return (
    <div draggable={!!onDragStart} onDragStart={onDragStart} className="relative min-w-0">
      <button type="button" onClick={onSelect} aria-current={activa ? 'true' : undefined}
        aria-label={ariaBaldosa({ nombre, cod, estado, avance, chip: chip.texto, conGuia, agregados, odoo })}
        title={tipo ? `${nombre} · ${tipo.label}` : nombre}
        className={`w-full h-full min-h-[116px] rounded-card px-1.5 pt-2 pb-1.5 flex flex-col items-center gap-0.5 text-center cursor-pointer select-none transition-colors active:opacity-80 ${CAJA_BALDOSA[estado]} ${activa ? 'ring-2 ring-navy ring-offset-2 ring-offset-bg' : ''}`}>
        {/* Dos anillos: afuera lo pesado, adentro los movimientos de Odoo (ámbar mientras
            faltan, verde al terminar). Sin movimientos de Odoo, solo el de afuera. */}
        <span aria-hidden="true"
          className={`relative w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 ${ANILLO[estado]}`}
          style={estado === 'pendiente' ? undefined : { background: `conic-gradient(var(--anillo) 0 ${pct}%, var(--color-bg-3) ${pct}% 100%)` }}>
          <PresenciaBadge viendo={viendo} />
          <span className="w-[52px] h-[52px] rounded-full bg-card flex items-center justify-center">
            {odooPct !== null ? (
              <span className={`w-[48px] h-[48px] rounded-full flex items-center justify-center ${odooListo ? '[--anillo-odoo:var(--est-ok)]' : '[--anillo-odoo:var(--est-aviso)]'}`}
                style={{ background: `conic-gradient(var(--anillo-odoo) 0 ${odooPct}%, var(--color-bg-3) ${odooPct}% 100%)` }}>
                <Centro sigla={sigla} numero={numero} chico />
              </span>
            ) : <Centro sigla={sigla} numero={numero} />}
          </span>
        </span>
        <span aria-hidden="true" className="w-full text-apoyo font-bold text-text leading-tight line-clamp-2 break-words">{nombre}</span>
        {/* Cada parte entera en su línea si no cabe: «1/2 b.» nunca se parte en «1/2» y «b.». */}
        <span aria-hidden="true" className={`flex flex-wrap justify-center gap-x-1 text-rotulo tracking-normal font-semibold leading-tight ${DETALLE_BALDOSA[estado]}`}>
          {detalleBaldosa(estado, avance).split(' · ').map((parte, i) => (
            <span key={i} className="whitespace-nowrap">{i > 0 ? '· ' : ''}{parte}</span>
          ))}
        </span>
        {(aviso || (conGuia && estado !== 'lista') || otros.length > 0 || conOdoo) && (
          <span aria-hidden="true" className="flex flex-wrap justify-center gap-x-1.5 gap-y-0.5 text-rotulo tracking-normal leading-tight">
            {aviso && <span className="font-bold text-est-aviso">{aviso}</span>}
            {conGuia && estado !== 'lista' && <span className="font-bold uppercase text-sky-600">Guía</span>}
            {otros.map(o => <span key={o} className="text-text-sub">{o}</span>)}
            {conOdoo && <span className={`tabular-nums ${odooListo ? 'font-bold text-est-ok' : 'text-text-sub'}`}>{odooListo ? '✓ ' : ''}Odoo {odoo!.done}/{odoo!.total}</span>}
          </span>
        )}
      </button>
      {tipo && (
        <span aria-hidden="true" className="absolute top-1.5 left-1.5 text-rotulo font-extrabold uppercase px-1.5 rounded-full pointer-events-none" style={{ background: tipo.bg, color: tipo.color }}>
          {tipo.label.charAt(0)}
        </span>
      )}
      {accion && (
        <button type="button" onClick={accion.onClick}
          aria-label={accion.tipo === 'agregar' ? `Agregar ${nombre} a hoy` : `Retirar ${nombre} de hoy`}
          className="absolute -top-1.5 -right-1.5 w-[44px] h-[44px] flex items-center justify-center cursor-pointer">
          <span className={`w-8 h-8 rounded-full border-2 border-card flex items-center justify-center shadow-card ${accion.tipo === 'agregar' ? 'bg-est-ok text-white' : 'bg-est-aviso text-white'}`}>
            {accion.tipo === 'agregar' ? <Plus size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}
          </span>
        </button>
      )}
    </div>
  );
}

/** La última baldosa de «Hoy»: abre lo mismo que hoy agrega tiendas (la sección «Todas»). */
export function BaldosaAgregar({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="min-h-[116px] rounded-card border-[1.5px] border-dashed border-border-2 bg-transparent text-navy flex flex-col items-center justify-center gap-1.5 cursor-pointer active:bg-bg-2">
      <Plus size={22} aria-hidden="true" />
      <span className="text-apoyo font-bold">Agregar</span>
    </button>
  );
}

/**
 * «4/11 listas» y los tres estados con su conteo, en una línea. Cada estado es también el filtro:
 * tocarlo deja solo esas tiendas, tocarlo de nuevo vuelve a todas. Antes los filtros eran otra
 * fila debajo que repetía los mismos tres números, y en el teléfono la cabecera se comía media
 * pantalla.
 */
export function BarraDelDia({ resumen, filtro, onFiltro }: {
  resumen: ResumenDia; filtro: FiltroLista; onFiltro: (f: FiltroLista) => void;
}) {
  if (resumen.total === 0) return null;
  const estados: { id: EstadoLista; n: number; punto: string; texto?: string; nombre: string }[] = [
    { id: 'lista',     n: resumen.lista,     punto: 'bg-est-ok',                                   nombre: 'listas' },
    { id: 'curso',     n: resumen.curso,     punto: 'bg-navy',                   texto: 'cargando', nombre: 'cargando' },
    { id: 'pendiente', n: resumen.pendiente, punto: 'bg-card border-[1.5px] border-text-sub',      nombre: 'sin empezar' },
  ];
  return (
    <div className="bg-card border-b border-border px-3 flex items-center justify-between gap-2 flex-shrink-0">
      <span className="flex items-baseline gap-1.5 tabular-nums whitespace-nowrap" aria-label={`${resumen.lista} de ${resumen.total} tiendas listas`}>
        <span className="font-barlow-condensed text-cifra font-extrabold text-text leading-none">{resumen.lista}/{resumen.total}</span>
        <span className="text-cuerpo font-semibold text-text">{resumen.lista === 1 && resumen.total === 1 ? 'lista' : 'listas'}</span>
      </span>
      <span className="flex items-center gap-1" role="group" aria-label="Filtrar tiendas de hoy">
        {estados.map(e => {
          const on = filtro === e.id;
          return (
            // 44 px de alto para el dedo; la píldora visible es la de adentro.
            <button key={e.id} type="button" aria-pressed={on} disabled={!on && e.n === 0}
              onClick={() => onFiltro(on ? 'todas' : e.id)}
              aria-label={on ? `Mostrando solo ${e.nombre} (${e.n}). Tocar para ver todas` : `Mostrar solo ${e.nombre} (${e.n})`}
              className="min-h-[44px] flex items-center cursor-pointer disabled:cursor-default group">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-apoyo font-semibold tabular-nums whitespace-nowrap group-disabled:opacity-50 ${
                on ? 'bg-navy text-white border-navy' : 'bg-card text-text-2 border-border'}`}>
                <i className={`w-2.5 h-2.5 rounded-full ${e.punto} ${on ? 'ring-1 ring-white' : ''}`} aria-hidden="true" />
                {e.n}{e.texto && <span className="max-[359px]:hidden"> {e.texto}</span>}
              </span>
            </button>
          );
        })}
      </span>
    </div>
  );
}

/**
 * Las unidades del día, «84 P · 40 B», grandes y con el color de su tipo. Van en el rótulo
 * «Hoy», que queda pegado arriba al bajar por la lista: se siguen viendo sin ocupar una fila.
 */
export function UnidadesDelDia({ unidades }: { unidades: { letra: string; n: number }[] }) {
  const visibles = unidades.filter(u => u.n > 0);
  if (visibles.length === 0) return null;
  return (
    <span className="flex items-center gap-1" aria-label={visibles.map(u => `${u.n} ${u.letra}`).join(', ')}>
      {visibles.map(u => {
        const clase = CLASE_LETRA[u.letra];
        const estilo = clase ? ESTILO_UNIDAD[clase] : null;
        return (
          <span key={u.letra} aria-hidden="true" className={`inline-flex items-baseline gap-0.5 rounded-btn px-1.5 normal-case ${estilo?.suave ?? 'bg-bg-2'}`}>
            <span className="font-barlow-condensed text-titulo font-extrabold text-text tabular-nums leading-tight tracking-normal">{u.n}</span>
            <span className={`font-barlow-condensed text-apoyo font-extrabold tracking-normal ${estilo?.texto ?? 'text-text-sub'}`}>{u.letra}</span>
          </span>
        );
      })}
    </span>
  );
}

/** «lun 6 oct»: el día de armado, corto para que quepa en la misma línea que el despacho. */
function armadoCorto(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/[.,]/g, '');
}

/**
 * Armado, despacho y (en RM/Costa) los grupos, en una sola línea. Antes eran dos columnas con
 * la fecha larga, y en el teléfono RM|Costa bajaba a una fila propia.
 */
export function FechasBodega({ armado, despacho, min, onDespacho, registrado, children }: {
  /** Día de armado, `AAAA-MM-DD`. */
  armado: string;
  despacho: string;
  min: string;
  onDespacho: (fecha: string) => void;
  registrado: boolean;
  /** A la derecha: el selector RM|Costa. */
  children?: ReactNode;
}) {
  return (
    <div className="bg-card border-b border-border px-3 py-1.5 flex items-center gap-3 flex-shrink-0">
      <span className="flex flex-col leading-tight">
        <span className="text-rotulo font-bold uppercase text-text-sub">Armado</span>
        <span className="text-apoyo text-text-2 whitespace-nowrap">{armadoCorto(armado)}</span>
      </span>
      <label className="flex flex-col leading-tight">
        <span className="text-rotulo font-bold uppercase text-text-sub">Despacho</span>
        <input type="date" value={despacho} min={min} onChange={e => onDespacho(e.target.value)}
          className="border-[1.5px] border-border rounded-btn px-1.5 py-0.5 text-apoyo font-bold text-navy bg-card" />
      </label>
      {children && <span className="ml-auto">{children}</span>}
      {registrado && (
        <span title="Registrado" className={`${children ? '' : 'ml-auto'} inline-flex items-center gap-1 rounded-full border border-est-ok bg-est-ok-suave text-est-ok text-rotulo font-bold px-1.5 py-0.5`}>
          ✓<span className="max-sm:sr-only">Registrado</span>
        </span>
      )}
    </div>
  );
}

/** Rótulo de sección dentro de la lista: «Hoy», «Todas ▼». */
export function RotuloLista({ children, derecha, onClick }: { children: ReactNode; derecha?: ReactNode; onClick?: () => void }) {
  const cuerpo = (
    <>
      <span className="font-barlow-condensed text-rotulo font-bold uppercase text-text-sub flex-1 text-left">{children}</span>
      {derecha}
    </>
  );
  const clase = 'w-full px-3.5 pt-3 pb-1.5 flex items-center gap-2 bg-bg sticky top-0 z-20';
  return onClick
    ? <button type="button" onClick={onClick} className={`${clase} cursor-pointer`}>{cuerpo}</button>
    : <div className={clase}>{cuerpo}</div>;
}

export interface AccionPie {
  id: string;
  icono: ReactNode;
  texto: string;
  onClick: () => void;
  disabled?: boolean;
  /** En el escritorio va como botón con texto. Si no, solo vive en el menú ⋯ del teléfono. */
  enEscritorio?: boolean;
  /** Ocupa el ancho sobrante en el escritorio (el Enrutador, como antes). */
  ancho?: boolean;
}

/**
 * El pie de la lista. En el teléfono: «Resumen» grande y ⋯ con lo demás. En el escritorio el
 * resumen ya está en la columna derecha, así que quedan solo las acciones con texto.
 */
export function PieLista({ resumen, acciones }: { resumen: { texto: string; onClick: () => void }; acciones: AccionPie[] }) {
  const [menu, setMenu] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const fuera = (e: PointerEvent) => { if (!caja.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [menu]);
  const escritorio = acciones.filter(a => a.enEscritorio);
  return (
    <div className="flex-shrink-0 bg-card border-t border-border px-3.5 pt-2.5 pb-3 flex gap-2">
      <button type="button" onClick={resumen.onClick}
        className="lg:hidden flex-1 min-h-[48px] rounded-card bg-navy text-white font-barlow-condensed text-titulo font-bold cursor-pointer active:opacity-90">
        {resumen.texto}
      </button>
      <div ref={caja} className="relative lg:hidden">
        <button type="button" onClick={() => setMenu(m => !m)} aria-expanded={menu} aria-label="Más acciones"
          className="w-[52px] h-full min-h-[48px] rounded-card bg-bg-2 text-text-2 flex items-center justify-center cursor-pointer active:bg-bg-3">
          <MoreHorizontal size={22} aria-hidden="true" />
        </button>
        {menu && (
          <div className="absolute right-0 bottom-full mb-2 z-30 w-64 bg-card border border-border rounded-card shadow-card2 p-1.5 flex flex-col">
            {acciones.map(a => (
              <button key={a.id} type="button" disabled={a.disabled}
                onClick={() => { setMenu(false); a.onClick(); }}
                className="flex items-center gap-3 min-h-[44px] px-3 rounded-btn text-cuerpo text-text text-left cursor-pointer active:bg-bg-2 disabled:opacity-50">
                <span className="text-text-sub flex-shrink-0">{a.icono}</span>
                {a.texto}
              </button>
            ))}
          </div>
        )}
      </div>
      {escritorio.map(a => (
        <button key={a.id} type="button" onClick={a.onClick} disabled={a.disabled} title={a.texto}
          className={`hidden lg:flex ${a.ancho ? 'flex-1' : 'flex-shrink-0'} items-center justify-center gap-1.5 py-2.5 px-4 rounded-btn cursor-pointer active:scale-95 bg-bg-2 text-text-2 border border-border disabled:opacity-60`}>
          {a.icono}
          <span className="font-barlow-condensed text-apoyo font-bold">{a.texto}</span>
        </button>
      ))}
    </div>
  );
}
