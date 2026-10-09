// Qué muestra cada fila de la tabla de encargados de Seco. Puro y testeable.
//
// La tabla no decide nada nuevo: resume lo que la tarjeta del encargado ya sabía (estado de Odoo,
// unidades, etiquetas) para verlo de un vistazo. Las reglas de qué unidad corresponde a qué
// sección son las de tiposUnidad.ts.

import type { PalletSlot, PickingOperation, SectionFilter } from '../picking-types';
import { STATE_INFO } from '../picking-utils';
import { tiposDeUnidad, type ClaveUnidad } from '../tiposUnidad';

export type Tono = 'ok' | 'warn' | 'bad' | 'mute' | 'info';

/** Color de cada sección (diseño «Picking, propuesta empresarial»). */
export const COLOR_SECCION: Record<string, string> = {
  Comida: '#D9480F', Aseo: '#0C8599', Hogar: '#3B5BDB', Chocolates: '#8B5A2B', Congelados: '#0891B2',
};

const AVATARES = ['#7048E8', '#3B5BDB', '#8B5A2B', '#0C8599', '#D9480F', '#2B8A3E', '#C2255C', '#5F3DC4'];

/** Color estable por encargado: el mismo nombre siempre sale del mismo color. */
export function colorAvatar(clave: string): string {
  let h = 0;
  for (const ch of clave) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARES[h % AVATARES.length];
}

/** «Juan Pérez» → «JP». Una sola palabra, sus dos primeras letras. */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Estado de las operaciones de Odoo del encargado, como lo dice la columna ESTADO. */
export function estadoOdoo(ops: Pick<PickingOperation, 'state'>[]): { texto: string; tono: Tono } {
  if (ops.length === 0) return { texto: 'Manual', tono: 'mute' };
  const hechas = ops.filter(o => o.state === 'done').length;
  if (hechas === ops.length) return { texto: ops.length > 1 ? `Realizado ${hechas}/${ops.length}` : 'Realizado', tono: 'ok' };
  if (hechas > 0) return { texto: `${hechas}/${ops.length} realizadas`, tono: 'warn' };
  const pendiente = ops.find(o => o.state !== 'done')!;
  return { texto: STATE_INFO[pendiente.state]?.label ?? pendiente.state, tono: pendiente.state === 'cancel' ? 'bad' : 'warn' };
}

/**
 * Las secciones de seco de una fila (Comida, Aseo, Hogar, Chocolates). Un Mixto trae dos. Sin
 * ninguna reconocible (encargado manual vacío) queda en «Todas».
 */
export function seccionesDeFila(categorias: string[]): SectionFilter[] {
  const mapa: Record<string, SectionFilter> = { Comida: 'comida', Aseo: 'aseo', Hogar: 'hogar', Chocolates: 'chocolates' };
  const s = [...new Set(categorias.map(c => mapa[c]).filter(Boolean))];
  return s.length > 0 ? s : ['all'];
}

/**
 * Qué unidades se cuentan en la fila: las que tiposUnidad.ts permite en ALGUNA de sus secciones,
 * más las que ya tienen unidades (nunca se esconde algo que existe). Con un filtro de sección
 * activo manda ese filtro, igual que en la tarjeta.
 */
export function unidadesDeFila(
  secciones: SectionFilter[], filtro: SectionFilter, conteos: Partial<Record<string, number>>,
): ClaveUnidad[] {
  const desde = filtro !== 'all' ? [filtro] : secciones;
  const set = new Set<ClaveUnidad>();
  for (const s of desde) for (const t of tiposDeUnidad(false, s, conteos)) set.add(t);
  return tiposDeUnidad(false, 'all', conteos).filter(t => set.has(t));
}

/** Por qué no aparece el chocolate (o los bultos) en el detalle. null si no falta nada. */
export function notaUnidades(secciones: SectionFilter[], unidades: ClaveUnidad[]): string | null {
  const nombres: Record<string, string> = { comida: 'Comida', aseo: 'Aseo', hogar: 'Hogar', chocolates: 'Chocolates' };
  const lista = secciones.filter(s => s !== 'all').map(s => nombres[s]);
  if (lista.length === 0) return null;
  const quien = lista.length === 1 ? lista[0] : `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`;
  const plural = lista.length > 1;
  if (!unidades.some(u => u.startsWith('CH'))) return `${quien} no ${plural ? 'llevan' : 'lleva'} chocolate, por eso no aparece.`;
  if (!unidades.includes('B')) return `${quien} no ${plural ? 'llevan' : 'lleva'} bultos, por eso no aparecen.`;
  return null;
}

/** Unidades del encargado por tipo, sumando las dos cajas de chocolate. */
export function totalesPorTipo(conteos: Partial<Record<string, number>>): {
  P: number; B: number; CH: number; CC: number; CN: number; total: number;
} {
  const n = (k: string) => conteos[k] ?? 0;
  const CH = n('CH') + n('CH:negra') + n('CH:carton');
  const total = Object.values(conteos).reduce<number>((a, b) => a + (b ?? 0), 0);
  return { P: n('P'), B: n('B'), CH, CC: n('CC'), CN: n('CN'), total };
}

/** 80.5 → «80,5». Un decimal, coma chilena. */
export function formatoKg(kg: number): string {
  return kg.toFixed(1).replace('.', ',');
}

/** Cuántas unidades todavía no tienen etiqueta. El código canónico se asigna en la primera impresión. */
export function sinImprimir(slots: Pick<PalletSlot, 'canonical_id'>[]): number {
  return slots.filter(s => !s.canonical_id).length;
}

/** La columna ETIQUETAS. */
export function estadoEtiquetas(a: {
  unidades: number; pendientes: number; bloqueadaPorOdoo: boolean; enOtraSeccion: boolean;
  /** Hora de la última impresión («10:42»), si se sabe. */
  hora?: string | null;
}): { texto: string; tono: Tono } {
  if (a.unidades === 0) return a.enOtraSeccion ? { texto: 'En otra sección', tono: 'info' } : { texto: 'Falta contar', tono: 'mute' };
  if (a.bloqueadaPorOdoo) return { texto: 'Espera a Odoo', tono: 'mute' };
  if (a.pendientes > 0) return { texto: `${a.pendientes} por imprimir`, tono: 'info' };
  return { texto: a.hora ? `Impresas ${a.hora}` : 'Impresas', tono: 'ok' };
}
