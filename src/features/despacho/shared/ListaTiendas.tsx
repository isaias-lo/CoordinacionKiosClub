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
//   1. La barra del día: cuántas tiendas están listas, en curso y sin empezar.
//   2. Filtros con esos mismos tres estados.
//   3. Una fila por tienda: código, nombre completo, estado, y «P 4/5 · B 1/3».
//   4. El pie: «Resumen» y un menú ⋯ con lo demás.
//
// Retirar una tienda de hoy pasó al menú ⋯ («Editar tiendas de hoy»): la × en cada baldosa se
// tocaba sin querer. Agregar sigue a mano en «Todas», que es para eso.
//
// La lógica (estado, avance, filtros) vive en `listaTiendas.ts`, sin React.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal, Plus, X } from 'lucide-react';
import type { AvanceTienda } from './unidadVisual';
import { BarraAvance, ConteoPorTipo } from './TiendaAbierta';
import { PresenciaBadge } from './PresenciaBadge';
import { StoreProgressBar } from './StoreProgressBar';
import type { ViendoInfo } from './usePresenciaTienda';
import { chipFila, type EstadoLista, type FiltroLista, type ResumenDia, type TonoChip } from './listaTiendas';

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
}

export function FilaTienda({ cod, nombre, tipo, estado, activa, conGuia, avance, agregados, sinPesar, odoo, viendo, onSelect, onDragStart, accion }: FilaTiendaProps) {
  const chip = chipFila({ estado, sinPesar, conGuia });
  const otros = agregados ? [
    agregados.adquisicion > 0 && { letra: 'A', n: agregados.adquisicion, titulo: 'Adquisiciones: no se pesan' },
    agregados.webRetiro > 0 && { letra: 'W', n: agregados.webRetiro, titulo: 'Web / retiro: no se pesan' },
  ].filter(Boolean) as { letra: string; n: number; titulo: string }[] : [];
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      className={`relative flex items-stretch border-b border-border transition-colors ${activa ? 'bg-navy/[0.07] shadow-[inset_4px_0_0_theme(colors.navy.DEFAULT)]' : 'bg-card active:bg-bg-2'}`}>
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
            <span className="text-rotulo font-bold uppercase text-est-ok whitespace-nowrap" title="Ya tiene su guía">Guía</span>
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

/** «12 de 31 listas», la barra partida en listas / en curso, y las unidades del día. */
export function BarraDelDia({ resumen, unidades }: {
  resumen: ResumenDia;
  /** Lo que antes iba en la franja navy del pie: «84 P · 40 B». */
  unidades: { letra: string; n: number }[];
}) {
  if (resumen.total === 0) return null;
  const pct = (n: number) => `${(n / resumen.total) * 100}%`;
  const visibles = unidades.filter(u => u.n > 0);
  return (
    <div className="bg-card border-b border-border px-3.5 py-2.5 flex flex-col gap-2 flex-shrink-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-barlow-condensed text-cifra font-extrabold text-text tabular-nums">
          {resumen.lista} <span className="text-cuerpo font-bold text-text-sub">de {resumen.total} {resumen.total === 1 ? 'tienda lista' : 'tiendas listas'}</span>
        </span>
        {visibles.length > 0 && (
          <span className="text-apoyo text-text-sub tabular-nums whitespace-nowrap">
            {visibles.map(u => `${u.n} ${u.letra}`).join(' · ')}
          </span>
        )}
      </div>
      <div className="h-2 rounded-full bg-bg-3 overflow-hidden flex" role="img"
        aria-label={`${resumen.lista} listas, ${resumen.curso} en curso, ${resumen.pendiente} sin empezar`}>
        <span className="h-full bg-est-ok transition-[width] duration-300" style={{ width: pct(resumen.lista) }} />
        <span className="h-full bg-navy transition-[width] duration-300" style={{ width: pct(resumen.curso) }} />
      </div>
      <div className="flex gap-3 flex-wrap text-rotulo font-semibold text-text-sub normal-case tracking-normal">
        <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-est-ok" />{resumen.lista} listas</span>
        <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-navy" />{resumen.curso} en curso</span>
        <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-border-2" />{resumen.pendiente} sin empezar</span>
      </div>
    </div>
  );
}

const FILTROS: { id: FiltroLista; texto: string }[] = [
  { id: 'todas', texto: 'Hoy' },
  { id: 'curso', texto: 'En curso' },
  { id: 'pendiente', texto: 'Sin empezar' },
  { id: 'lista', texto: 'Listas' },
];

export function FiltroTiendas({ filtro, resumen, onFiltro }: {
  filtro: FiltroLista; resumen: ResumenDia; onFiltro: (f: FiltroLista) => void;
}) {
  if (resumen.total === 0) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto px-3.5 py-2 bg-bg border-b border-border flex-shrink-0 [scrollbar-width:none]" role="tablist" aria-label="Filtrar tiendas de hoy">
      {FILTROS.map(f => {
        const n = f.id === 'todas' ? resumen.total : resumen[f.id];
        const on = filtro === f.id;
        return (
          <button key={f.id} type="button" role="tab" aria-selected={on} onClick={() => onFiltro(f.id)} disabled={!on && n === 0}
            className={`flex-shrink-0 text-apoyo font-semibold px-3 py-1.5 rounded-full border whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-default ${on ? 'bg-navy text-white border-navy' : 'bg-card text-text-2 border-border'}`}>
            {f.texto} <span className="tabular-nums">{n}</span>
          </button>
        );
      })}
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
