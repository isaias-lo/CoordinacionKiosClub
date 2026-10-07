// El «Resumen del día» de Bodega, sin React. Compartido por Nacional y RM/Costa.
//
// Los totales salen de `contarPorClase`, la misma cuenta que la lista de tiendas: antes el resumen
// de Nacional contaba como «bulto» todo lo que no era pallet ni chocolate —contenedores,
// adquisiciones y web/retiro incluidos— y su número no cuadraba con el de la lista.

import type { ClaseEnvase } from './numeroCard';

export interface TotalesResumen {
  pallet: number;
  bulto: number;
  contenedor: number;
  chocolate: number;
  /** Adquisiciones y web/retiro: existen, pero no se pesan. */
  agregado: number;
  /** Unidades que se pesan (las cuatro primeras). */
  unidades: number;
  kg: number;
  monto: number;
}

export function totalesResumen<T extends { peso?: number | null; valor?: number | null }>(
  items: readonly T[], claseDe: (item: T) => ClaseEnvase,
): TotalesResumen {
  const t: TotalesResumen = { pallet: 0, bulto: 0, contenedor: 0, chocolate: 0, agregado: 0, unidades: 0, kg: 0, monto: 0 };
  for (const i of items) {
    const v = Number(i.valor);
    if (Number.isFinite(v) && v > 0) t.monto += v;
    const c = claseDe(i);
    if (c === 'adquisicion' || c === 'webretiro') { t.agregado++; continue; }
    t[c]++;
    t.unidades++;
    const kg = Number(i.peso);
    if (Number.isFinite(kg) && kg > 0) t.kg += kg;
  }
  // Sumar decimales arrastra coma flotante (0,1 + 0,2): se redondea a la décima, que es lo que
  // marca la balanza.
  t.kg = Math.round(t.kg * 10) / 10;
  return t;
}

const KG = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });

/** `4.210,5 kg`. */
export function formatoKg(kg: number): string {
  return `${KG.format(Number.isFinite(kg) ? kg : 0)} kg`;
}

/** `120 × 100 × 150 cm`, sin los ceros de lo que no se midió. Vacío si no hay nada. */
export function formatoMedidas(...cm: (number | null | undefined)[]): string {
  const v = cm.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);
  return v.length ? `${v.join(' × ')} cm` : '';
}

/** Lo que dice la barra de arriba: «4 de 11 tiendas listas». */
export function textoAvanceTiendas(listas: number, total: number): string {
  if (total <= 0) return 'Sin tiendas hoy';
  if (listas >= total) return total === 1 ? 'La tienda de hoy está lista' : `Las ${total} tiendas de hoy están listas`;
  return `${listas} de ${total} tienda${total === 1 ? '' : 's'} lista${listas === 1 ? '' : 's'}`;
}

/**
 * La copia de una unidad a otra tienda. Sin `id`, sin slot de Picking y sin código canónico:
 * llevarlos hacía que dos tiendas compartieran la misma unidad —el mismo id para el merge entre
 * equipos, el mismo slot para la reconciliación— y una pisaba a la otra.
 */
export function copiaParaOtraTienda<T extends { id?: string; pickingSlotId?: number; canonical_id?: string; guia?: string; orden?: string }>(item: T): T {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, pickingSlotId, canonical_id, ...resto } = item;
  return { ...resto, guia: '', orden: '' } as T;
}

/**
 * La posición ACTUAL de la unidad que se estaba editando. Se edita por id y no por posición: si
 * otro equipo agregó o borró algo mientras el formulario estaba abierto, la posición de antes ya
 * apunta a otra unidad, y «Guardar» la pisaba. `-1` si la unidad ya no está.
 */
export function posicionDeUnidad(items: readonly { id?: string }[], id: string | undefined, idxAntes: number): number {
  if (id) return items.findIndex(i => i.id === id);
  return idxAntes >= 0 && idxAntes < items.length ? idxAntes : -1;
}
