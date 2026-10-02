// La lista de tiendas de Bodega, en filas. Lo que decide cada fila, sin React.
//
// Una tienda está en uno de tres estados, y son los mismos que los filtros de arriba:
//
//     lista       → alguien la marcó Terminada.
//     curso       → tiene al menos una unidad cargada y no está terminada.
//     pendiente   → no tiene nada cargado todavía.
//
// "Lista" sale de la marca manual y no de "todo pesado" a propósito: Picking puede seguir
// imprimiendo pallets para una tienda que parecía completa, y solo Bodega sabe cuándo cerró.

import type { AvanceTienda, AvanceTipo, ClaseUnidad } from './unidadVisual';

export type EstadoLista = 'lista' | 'curso' | 'pendiente';
export type FiltroLista = 'todas' | EstadoLista;

type Pesable = Exclude<ClaseUnidad, 'agregado'>;
export type ConteoPesable = Record<Pesable, number>;

export function estadoLista(t: { cargadas: number; terminada: boolean }): EstadoLista {
  if (t.terminada) return 'lista';
  return t.cargadas > 0 ? 'curso' : 'pendiente';
}

const ORDEN: Pesable[] = ['pallet', 'contenedor', 'bulto', 'chocolate'];

/**
 * El avance de una fila: por tipo, cuántas unidades están cargadas sobre cuántas lleva la tienda.
 * El total suma las que Picking ya imprimió y Bodega todavía no cargó (las insignias punteadas
 * de antes), así «P 4/5» dice de una vez cuántos pallets hay y cuántos faltan.
 */
export function avanceFila(cargadas: ConteoPesable, faltan: ConteoPesable): AvanceTienda {
  const porTipo: AvanceTipo[] = [];
  let pesadas = 0;
  let total = 0;
  for (const clase of ORDEN) {
    const c = Math.max(0, cargadas[clase] || 0);
    const t = c + Math.max(0, faltan[clase] || 0);
    if (t === 0) continue;
    porTipo.push({ clase, pesadas: c, total: t });
    pesadas += c;
    total += t;
  }
  return { pesadas, total, porTipo };
}

export interface ResumenDia {
  total: number;
  lista: number;
  curso: number;
  pendiente: number;
}

export function resumenDia(estados: readonly EstadoLista[]): ResumenDia {
  const r: ResumenDia = { total: estados.length, lista: 0, curso: 0, pendiente: 0 };
  for (const e of estados) r[e]++;
  return r;
}

export function pasaFiltro(estado: EstadoLista, filtro: FiltroLista): boolean {
  return filtro === 'todas' || filtro === estado;
}

/** Un filtro que se quedó sin tiendas no deja la lista vacía: vuelve a mostrar todas. */
export function filtroVigente(filtro: FiltroLista, r: ResumenDia): FiltroLista {
  return filtro !== 'todas' && r[filtro] === 0 ? 'todas' : filtro;
}

export type TonoChip = 'ok' | 'aviso' | 'curso' | 'apagado';

/**
 * La etiqueta de estado de una fila. Lo que hay que ir a mirar gana:
 *   1. unidades guardadas sin pesar (la excepción que hay que perseguir);
 *   2. terminada sin guía (antes, la tarjeta ámbar);
 *   3. el estado del día.
 */
export function chipFila(t: { estado: EstadoLista; sinPesar: number; conGuia: boolean }): { texto: string; tono: TonoChip } {
  if (t.sinPesar > 0) return { texto: `${t.sinPesar} sin pesar`, tono: 'aviso' };
  if (t.estado === 'lista') return t.conGuia ? { texto: 'Lista', tono: 'ok' } : { texto: 'Falta guía', tono: 'aviso' };
  if (t.estado === 'curso') return { texto: 'En curso', tono: 'curso' };
  return { texto: 'Sin empezar', tono: 'apagado' };
}
