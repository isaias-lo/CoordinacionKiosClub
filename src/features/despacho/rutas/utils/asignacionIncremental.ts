// Completar el tablero sin deshacer lo que el coordinador ya armó.
//
// El problema que resuelve: la carga no llega toda junta. Bodega va registrando durante la mañana,
// así que el pool crece de a poco. La auto-asignación, en cambio, corría UNA sola vez —cuando el
// tablero estaba vacío— y además "tablero vacío" se medía contando LLAVES del objeto, no camiones
// con tiendas. Como el tablero deja llaves con lista vacía al sacar una tienda (y las crea para
// todas las patentes al mover en bloque), bastaba mover una tienda una vez para que el tablero
// nunca volviera a estar "vacío". Desde ahí, ninguna tienda nueva de Bodega se asignaba sola: iban
// al pool y ahí se quedaban. Y como el tablero se guarda, el bloqueo sobrevivía a recargar la
// página y se propagaba a los otros dispositivos.
//
// La respuesta no es volver a correr la asignación completa (eso pisaría el trabajo manual), sino
// rutear SOLO lo que falta sobre la capacidad que queda. Estas funciones son puras y se testean
// sin React ni motor.

import type { StoreItem } from './routing';
import type { Vehiculo } from '../data/flota';

/** Códigos que ya están en algún camión del tablero. */
export function codsAsignados<T extends { c: string }>(asignaciones: Record<string, T[]>): Set<string> {
  return new Set(Object.values(asignaciones).flat().map(s => s.c));
}

/** Las tiendas del pool que todavía no están en ningún camión. */
export function pendientesDelPool(
  pool: StoreItem[],
  asignaciones: Record<string, { c: string }[]>,
): StoreItem[] {
  const yaEstan = codsAsignados(asignaciones);
  return pool.filter(t => !yaEstan.has(t.c));
}

/**
 * Flota "sombra": los mismos camiones, pero con la capacidad que les QUEDA.
 *
 * Se le pasa al motor para que reparta lo pendiente sin sobrecargar a nadie: un camión que ya
 * lleva 6 de 10 pallets entra a la ronda como si fuera de 4. Se excluyen los cerrados (su
 * manifiesto ya salió) y los que no tienen sitio.
 */
export function flotaConCapacidadRestante(
  flota: Vehiculo[],
  asignaciones: Record<string, { p: number }[]>,
  esCerrada: (patente: string) => boolean = () => false,
): Vehiculo[] {
  const out: Vehiculo[] = [];
  for (const v of flota) {
    if (!v.on || esCerrada(v.p)) continue;
    const usados   = (asignaciones[v.p] ?? []).reduce((s, t) => s + (t.p ?? 0), 0);
    const restante = (v.c ?? 0) - usados;
    if (restante <= 0) continue;
    out.push({ ...v, c: restante });
  }
  return out;
}

/**
 * Suma la propuesta nueva al tablero actual. SOLO agrega: nunca mueve ni saca lo que ya estaba.
 *
 * Es la diferencia con "Reasignar todo", que reemplaza el tablero entero. Acá lo que el
 * coordinador puso a mano se queda donde está.
 */
export function fusionarAsignaciones<T extends { c: string }>(
  actuales: Record<string, T[]>,
  nuevas: Record<string, T[]>,
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const [patente, tiendas] of Object.entries(actuales)) out[patente] = [...(tiendas ?? [])];

  const yaEstan = codsAsignados(actuales);
  for (const [patente, tiendas] of Object.entries(nuevas)) {
    for (const t of tiendas ?? []) {
      if (yaEstan.has(t.c)) continue;   // defensivo: una tienda vive en un solo camión
      (out[patente] ??= []).push(t);
      yaEstan.add(t.c);
    }
  }
  return out;
}

/**
 * Saca del tablero las patentes que quedaron con la lista vacía.
 *
 * El tablero se guarda en `shared_session_state` y se sincroniza entre dispositivos, así que estas
 * llaves fantasma no son solo ruido: son las que hacían que "¿el tablero está vacío?" —que contaba
 * llaves— diera `false` para siempre.
 */
export function podarVacias<T>(asignaciones: Record<string, T[]>): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const [patente, tiendas] of Object.entries(asignaciones)) {
    if (tiendas && tiendas.length > 0) out[patente] = tiendas;
  }
  return out;
}

/** ¿Hay algún camión con tiendas? Cuenta CONTENIDO, no llaves. */
export function tableroConTrabajo<T>(asignaciones: Record<string, T[]>): boolean {
  return Object.values(asignaciones).some(a => (a?.length ?? 0) > 0);
}

/**
 * Saca del tablero las tiendas de un camión y las devuelve a "sin asignar".
 *
 * Apagar un camión no las sacaba: la columna dejaba de dibujarse, el camión no emitía manifiesto
 * (`rutasDesdeAsignaciones` filtra por `v.on`) y esa carga no salía — pero el tablero la seguía
 * dando por asignada, así que tampoco entraba al pool ni a la 2ª vuelta. Quedaba en tierra sin
 * que nada lo dijera.
 *
 * La patente se CONSERVA con lista vacía, no se borra: es el mismo contrato que `porCamion`
 * —un camión sin tiendas sigue en el tablero— y evita que al volver a encenderlo parezca otro.
 */
export function liberarCamion<T extends { c: string }>(
  asignaciones: Record<string, T[]>,
  patente: string,
): { asignaciones: Record<string, T[]>; liberadas: T[] } {
  const actuales = asignaciones?.[patente] ?? [];
  const liberadas = actuales.filter(t => t?.c);
  if (!liberadas.length) return { asignaciones, liberadas: [] };
  return { asignaciones: { ...asignaciones, [patente]: [] }, liberadas };
}
