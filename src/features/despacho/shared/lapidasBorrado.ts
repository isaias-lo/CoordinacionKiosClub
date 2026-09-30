// La lápida de un borrado: que borrar algo siga queriendo decir borrado después del próximo push.
//
// Medido el 24/09 sobre `actividad_bodega` (12 días): de 135 chocolates borrados, **35 volvieron y
// hubo que borrarlos de nuevo** — 26%. El caso más claro, 33CON el 16/09: CH2…CH11 borrados entre
// las 15:06:42 y las 15:06:55, y los mismos nueve borrados otra vez entre las 15:06:55 y las
// 15:06:59. También le pasó a un pallet (P5 de 04PDG, 15/09, con 49 minutos entre un borrado y el
// otro), así que NO es un problema del chocolate: es que el chocolate es el 94% de lo que se borra.
//
// El DELETE a `picking_pallets` nunca falló — de 155 borrados registrados en esos 12 días, cero
// slots sobrevivieron. Lo que vuelve no es la unidad de Picking: es el ÍTEM, por el merge de
// `shared_session_state`.
//
// El mecanismo, que es el mismo en los dos espejos:
//
//   1. El merge de tres vías decide con `base` = lo último que este equipo empujó o adoptó.
//   2. Un ítem que está en `base` y ya no está en `local` se lee como "lo borré yo" y NO se
//      resucita aunque el remoto lo traiga. Ese es el anti-zombie que ya existe, y funciona.
//   3. Pero al empujar, `base` pasa a ser el estado NUEVO — el que ya no tiene el ítem. Desde ese
//      instante el ítem no está ni en `local` ni en `base`, así que el mismo remoto que antes se
//      descartaba ahora se lee como **un alta nueva del otro equipo** y entra.
//
// O sea: el borrado se recuerda 2,5 segundos (lo que tarda el debounce del push) y después se
// olvida. Cualquier equipo que todavía no haya recibido el borrado y empuje su copia —no hace
// falta que borre nada, le alcanza con agregar un pallet en otra tienda— devuelve el ítem.
//
// Y si la tienda quedó "limpia" (local == base, que es exactamente como queda justo después de
// empujar), el merge adopta la tienda REMOTA ENTERA y vuelven todos de una vez. Por eso se borran
// cuatro cajas y "al salir aparece una": vuelven las que alcanzaron a quedar del otro lado.
//
// La lápida arregla eso: el borrado se recuerda aparte de la base, y el merge descarta cualquier
// ítem remoto que tenga una lápida puesta. Se levanta sola cuando la unidad se vuelve a crear
// (Revertir), que es el único caso en que el ítem debe poder volver.
//
// [29/09] Además, las lápidas ahora SE COMPARTEN entre equipos (ver `lapidasComoLista` /
// `absorberLapidas`) y son la única señal de borrado que respeta el merge.

/**
 * Llaves con lápida. Sin TTL a propósito.
 *
 * `recienBorrados` (ver `eliminarSlotPicking`) dura 5 segundos porque protege de UNA recarga en
 * vuelo. Esto protege de otra cosa: de cualquier equipo con una copia vieja, y esas copias viven
 * lo que viva su pestaña. En los datos hay reapariciones a los 13 segundos y a los 49 minutos.
 *
 * Un `id` de `picking_pallets` es una secuencia: no se reutiliza nunca, así que una lápida vieja no
 * puede tapar por error a una unidad DISTINTA. La memoria se va con la pestaña, y el día siguiente
 * empieza limpio porque el estado se indexa por fecha.
 *
 * ── PERO SÍ PUEDE TAPAR A LA MISMA UNIDAD, SI VUELVE (30/09/2026) ───────────────────────────────
 *
 * Esa premisa de arriba dejaba fuera un caso: existe un RESTAURAR que revive la misma unidad con
 * el MISMO id. Y entonces la lápida —que no vence, que viaja a todos los equipos y que nadie
 * podía quitar— queda encima de algo que existe, para siempre.
 *
 * Pasó dos veces el mismo día:
 *
 *     16PQA  bulto  borrado 11:15:48  →  RESTAURADO 11:47:48, mismo id 484
 *     12LAS  pallet borrado 17:39:54  →  restaurado después, mismo id 549
 *
 * El coordinador agregó el mismo bulto DOCE veces entre las 15:40 y las 18:29: el peso se guardaba
 * bien y un segundo después el merge le borraba la tarjeta. No pudo registrar el día.
 *
 * Y limpiar el estado compartido no servía: cada pestaña tenía las lápidas en memoria y las volvía
 * a empujar a los pocos segundos, porque `absorberLapidas` solo sabía SUMAR.
 *
 * El archivo ya lo había anticipado, en el comentario de `levantarLapida`: «una lápida que no se
 * levanta nunca es exactamente el bug contrario al que esto arregla».
 *
 * ── LA RED DE SEGURIDAD ────────────────────────────────────────────────────────────────────────
 *
 * Arreglar el `restaurar` no alcanza: la próxima puerta que revive un id vuelve a romperlo. Así
 * que la regla es otra, y no depende de que nadie se acuerde:
 *
 *   **si la unidad EXISTE en `picking_pallets`, su lápida no vale.**
 *
 * La recarga de picking —que ya corre en los dos espejos con 600 ms de debounce— levanta la lápida
 * de cada slot que la base le devuelve. Si la unidad está viva, su lápida muere sola, venga de
 * donde venga. Y se recuerda que se levantó, para que el push de otro equipo no la reinyecte.
 */
const lapidas = new Set<string>();

/**
 * Llaves cuya lápida se levantó porque la unidad VOLVIÓ A EXISTIR.
 *
 * Sin esto, levantar no servía de nada: `absorberLapidas` recibe la lista del otro equipo —que
 * todavía la trae— y la volvía a poner. Medido el 30/09: sacar la lápida de la base y verla
 * volver en segundos, empujada por una pestaña que nadie había recargado.
 */
const levantadas = new Set<string>();

/** La llave de una unidad de Picking, en el mismo formato que `stableItemKey`. */
export function llaveDeSlot(slotId: number): string {
  return `slot:${slotId}`;
}

/**
 * Marca una unidad como borrada. Lo llama `eliminarSlotPicking`, que es el único punto por donde
 * pasan TODOS los borrados de los dos espejos (formulario, Resumen y fila sin guardar).
 */
export function marcarLapida(slotId?: number | null): void {
  if (slotId == null) return;
  const k = llaveDeSlot(slotId);
  levantadas.delete(k);   // se borró otra vez: deja de estar «resucitada»
  lapidas.add(k);
}

/**
 * Levanta la lápida de una unidad. Lo llama `crearSlotBodega`, que es por donde pasa toda alta de
 * Bodega — incluido el Revertir, que recrea el slot.
 *
 * `create-bodega` entrega un id nuevo, así que en la práctica no hay lápida que levantar; está por
 * si algún día un slot se reactiva en vez de recrearse. Una lápida que no se levanta nunca es
 * exactamente el bug contrario al que esto arregla, y sale más barato prevenirlo que descubrirlo.
 */
export function levantarLapida(slotId?: number | null): void {
  if (slotId == null) return;
  const k = llaveDeSlot(slotId);
  lapidas.delete(k);
  levantadas.add(k);      // que el push de otro equipo no la reinyecte
}

/** ¿Esta llave —la de `stableItemKey`— corresponde a algo que se borró (acá o en otro equipo)? */
export function tieneLapida(llave: string): boolean {
  return lapidas.has(llave);
}

/**
 * Las lápidas viajan en el estado sincronizado (`borrados`). Desde el 29/09 el merge ya no lee
 * "el remoto no trae este ítem" como borrado —esa lectura era la que hacía desaparecer pallets
 * guardados cuando otro equipo empujaba una copia que todavía no los tenía—, así que la ÚNICA
 * forma de que un ítem salga en los demás equipos es que les llegue su lápida.
 */
export function lapidasComoLista(): string[] {
  return [...lapidas];
}

/**
 * La unidad existe en `picking_pallets`, así que su lápida no vale. Lo llama la recarga de picking
 * de los dos espejos, con cada slot que la base devuelve.
 *
 * Es la red que hace que esto no dependa de acordarse: no importa por qué puerta haya vuelto la
 * unidad —restaurar, revertir, o una que todavía no existe— si está viva, la lápida muere.
 */
export function levantarLapidasDeSlotsVivos(ids: Iterable<number>): void {
  for (const id of ids) levantarLapida(id);
}

/** Incorpora las lápidas que trae un remoto. Solo llaves de slot: un id de slot no se reutiliza. */
export function absorberLapidas(llaves: unknown): void {
  if (!Array.isArray(llaves)) return;
  for (const k of llaves) {
    // Una lápida que YA se levantó no vuelve a entrar. El otro equipo todavía la trae porque
    // nadie recargó su pestaña; acá ya se sabe que la unidad existe.
    if (typeof k === 'string' && k.startsWith('slot:') && !levantadas.has(k)) lapidas.add(k);
  }
}

/** Solo para tests: vacía el registro. */
export function _limpiarLapidas(): void {
  lapidas.clear();
  levantadas.clear();
}
