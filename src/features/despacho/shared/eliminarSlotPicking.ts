import { supabase } from '@/lib/supabase';
import { marcarLapida } from './lapidasBorrado';
import { logActividad } from '@/lib/actividad';

// [RC-3] Ids de slots recién borrados (con TTL). La recarga de picking (load) los FILTRA para
// que un borrado no "reviva": el canal de picking recarga la tabla completa con debounce 600 ms,
// y si ese reload llega antes de que el DELETE propague, re-insertaría el slot recién borrado
// (→ el backfill lo vuelve a materializar). Se limpia solo tras un margen de propagación.
const recienBorrados = new Set<number>();
const TTL_MS = 5000;

/** ¿El slot fue borrado hace muy poco? (para que `load` no lo re-inserte). */
export function fueRecienBorrado(id: number): boolean {
  return recienBorrados.has(id);
}

/** Marca un id como recién borrado (auto-expira). Lo llama `eliminarSlotPicking`. */
export function marcarRecienBorrado(id: number): void {
  recienBorrados.add(id);
  setTimeout(() => recienBorrados.delete(id), TTL_MS);
}

/** Quién borra y dónde, para que el borrado quede en la bitácora con nombre y tienda. */
export interface ContextoBorrado {
  fuente: 'rmcosta' | 'nacional';
  /** La tienda. Sin esto el evento no se puede filtrar en la pantalla Actividad. */
  tiendaCod?: string;
  tiendaNombre?: string;
  /** Cómo se llamaba la unidad en pantalla (`P2`, `CH1`). */
  label?: string;
  /**
   * El borrado ya se registra con su propia acción (`unificar`, `sumar`), así que acá no se
   * escribe otro evento. Se dice explícitamente y no se adivina.
   */
  yaRegistrado?: boolean;
}

/**
 * Borra el slot de `picking_pallets` vinculado a un ítem de Bodega.
 *
 * Causa raíz de "borro un pallet/CH en el Resumen y reaparece": el panel Resumen quitaba el
 * ítem del estado (`DELETE_ITEM`) pero NUNCA borraba el slot de `picking_pallets`, así que
 * seguía `is_active=true` y la reconstrucción/backfill del formulario lo volvía a materializar.
 * El formulario (deleteSavedRow) sí borra el slot; el Resumen no lo hacía. Este helper unifica
 * ese borrado para reusarlo desde ambos Resumen (RM/Costa y Nacional).
 *
 * Fire-and-forget (no bloquea la UI). Sin `slotId` (ítems manuales sin slot) es un no-op seguro.
 *
 * ── LA BITÁCORA SE ESCRIBE ACÁ, Y EL CONTEXTO ES OBLIGATORIO ──────────────────────────────────
 *
 * El 30/09, en 16PQA, desaparecieron cinco unidades —una de ellas un CH1 de 168,5 kg ya pesado— y
 * en la pantalla Actividad solo quedó UNA. Ese día el sistema entero borró 8 unidades y registró 1.
 *
 * La causa era que el borrado del slot era incondicional y el registro en la bitácora no: vivía en
 * los llamadores, y de los seis caminos que borran, cuatro no lo escribían — la ✕ de una tarjeta
 * sin guardar, la ✕ del panel Resumen (que borra un ítem CON su peso), y `deleteSavedRow` cuando la
 * fila había perdido su `savedItem`.
 *
 * Es el mismo modo de falla del #580: ahí se dijo que este archivo era "el único punto por el que
 * pasan todos los borrados" y un grep encontró tres caminos más. La lección no es acordarse mejor
 * — es que el compilador lo exija. Por eso `ctx` NO es opcional: un camino nuevo no compila hasta
 * decir de qué tienda es y si ya se registra con otra acción.
 *
 * El trigger `AFTER DELETE` de la tabla sigue guardando la fila entera en `picking_eventos`. Eso no
 * se toca: es la red de abajo, y guarda lo que se borró. Lo que faltaba era que se VIERA.
 */
export function eliminarSlotPicking(slotId: number | null | undefined, ctx: ContextoBorrado): void {
  if (!slotId) return;
  // `unificar` y `sumar` ya escriben su propio evento. Un `eliminar_item` encima contaría el mismo
  // borrado dos veces y torcería las mediciones que leen esa acción (`borradosRepetidos`,
  // `/api/medicion-bodega`).
  if (!ctx.yaRegistrado) {
    logActividad({
      accion: 'eliminar_item', fuente: ctx.fuente,
      tiendaCod: ctx.tiendaCod, tiendaNombre: ctx.tiendaNombre,
      label: ctx.label, slotId,
    });
  }
  marcarRecienBorrado(slotId); // guard anti-revive contra la recarga de picking (RC-3)
  // [Lápidas] El guard de arriba dura 5 s y protege de UNA recarga en vuelo. Este otro protege de
  // algo distinto y más largo: del equipo de al lado que todavía tiene el ítem en su copia y lo
  // devuelve al empujar. Ver `lapidasBorrado.ts` — es el 26% de chocolates que había que borrar
  // dos veces. Va acá porque es el único punto por el que pasan TODOS los borrados.
  marcarLapida(slotId);
  supabase.from('picking_pallets').delete().eq('id', slotId).then(({ error }) => {
    if (error) console.error('[eliminarSlotPicking]', error.message);
  });
}
