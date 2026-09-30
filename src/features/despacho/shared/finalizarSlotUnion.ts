import { supabase } from '@/lib/supabase';
import { unionRefs } from './unifyPallets';
import { marcarRecienBorrado } from './eliminarSlotPicking';
import { marcarLapida } from './lapidasBorrado';

/**
 * Cierra una unión de dos unidades en `picking_pallets`: fusiona las referencias en la que
 * sobrevive y borra la absorbida.
 *
 * Cuando dos bultos se juntan en un pallet, físicamente queda UNA unidad. Si el slot del absorbido
 * sigue vivo, todo lo que cuenta unidades —Seguimiento, Conteo de Flota— ve una de más, y el
 * backfill del formulario le vuelve a crear una tarjeta vacía al reabrir la tienda.
 *
 * Estaba duplicada palabra por palabra en los dos espejos de Bodega, y el flujo de "combinar" del
 * Resumen no la llamaba: ahí la unión dejaba el slot absorbido vivo. Acá queda una sola, con dos
 * cosas que a las copias les faltaban:
 *
 *  · El guard anti-revivir (RC-3). El canal de picking recarga la tabla con 600 ms de debounce; si
 *    ese reload sale antes de que propague el DELETE, re-inserta el slot recién borrado y el
 *    backfill lo materializa de nuevo. `eliminarSlotPicking` ya lo hacía; esto no.
 *  · La LÁPIDA. Una unión hace desaparecer una unidad igual que un borrado, así que el ítem
 *    absorbido puede volver por el merge de `shared_session_state` exactamente igual: el borrado
 *    solo se recuerda mientras siga en la base del merge, y la base avanza en cada push. Ver
 *    `lapidasBorrado.ts`. Faltaba acá, así que el arreglo de los borrados no cubría las uniones.
 *  · Decir si funcionó. Antes tragaba cualquier error en un `console.error` y seguía, así que una
 *    unión a medias —refs fusionadas, slot sin borrar— no se distinguía de una completa.
 *
 * `fire-and-forget` desde la UI: no bloquea, pero devuelve el resultado para que quien llama pueda
 * avisar si falló.
 *
 * ── NO SE BORRA NADA SI EL DESTINO YA NO EXISTE (30/09/2026) ───────────────────────────────────
 *
 * Esta función LEÍA los dos slots y nunca comprobaba que los dos volvieran. Si otro equipo había
 * borrado el destino, `refsDestino` quedaba `undefined`, el `update` de refs no encontraba a nadie
 * —sin error, porque un update de cero filas no falla— y **el borrado del absorbido se ejecutaba
 * igual**. La unidad que tenía el peso desaparecía para fundirse con una que ya no estaba.
 *
 * Pasó de verdad, en 12LAS, con dos personas sobre la misma tienda:
 *
 *     17:17:11  Sebastián pesa el P1 (slot 549) en 377 kg
 *     17:37:51  Isaías elimina el P2 (slot 550)
 *     17:39:53  Sebastián une P1 con P2  →  destino 550, que ya no existe
 *     17:39:54  se borra el slot 549  →  los 377 kg no quedan en ninguna parte
 *
 * La tienda terminó el día sin una sola unidad viva y marcada como TERMINADA 4/4.
 *
 * Ahora la función se niega y NO borra. El peso sigue donde está, que es lo único irreversible;
 * un slot de más es visible y se arregla recargando la tienda.
 */
export interface ResultadoUnion {
  ok: boolean;
  error?: string;
  /** No se tocó nada: o se rechazó antes de escribir, o ya estaba hecho. */
  sinCambios?: boolean;
}

export async function finalizarSlotUnion(
  idQueSobrevive: number,
  idAbsorbido: number,
): Promise<ResultadoUnion> {
  if (!idQueSobrevive || !idAbsorbido) return { ok: false, error: 'faltan ids' };
  if (idQueSobrevive === idAbsorbido) return { ok: false, error: 'son el mismo slot' };
  try {
    const { data, error: errLectura } = await supabase
      .from('picking_pallets').select('id, refs').in('id', [idQueSobrevive, idAbsorbido]);
    if (errLectura) return { ok: false, error: errLectura.message };

    const destino   = (data ?? []).find(d => d.id === idQueSobrevive);
    const absorbido = (data ?? []).find(d => d.id === idAbsorbido);

    // EL DESTINO TIENE QUE EXISTIR. Si no está, no hay dónde fundir nada y borrar al absorbido
    // sería tirar su peso. Se sale ANTES de tocar la base.
    if (!destino) {
      return { ok: false, sinCambios: true,
        error: 'la unidad de destino ya no existe — otro equipo la borró. Recarga la tienda.' };
    }
    // El absorbido ya no está: la unión ya ocurrió (o alguien lo borró). No hay nada que hacer y
    // tampoco es un error — repetir la operación tiene que dar el mismo resultado.
    if (!absorbido) return { ok: true, sinCambios: true };

    const refsDestino  = destino.refs as string | undefined;
    const refsAbsorbido = absorbido.refs as string | undefined;
    const fusionadas = unionRefs(refsDestino, refsAbsorbido);
    // Las referencias van PRIMERO: si el borrado falla queda un slot de más (molesto, visible), y
    // no una unidad sin sus referencias de Odoo (silencioso, irrecuperable).
    if (fusionadas && fusionadas !== (refsDestino ?? '')) {
      const { error } = await supabase.from('picking_pallets').update({ refs: fusionadas }).eq('id', idQueSobrevive);
      if (error) return { ok: false, error: error.message };
    }

    marcarRecienBorrado(idAbsorbido);   // que la recarga de picking no lo reviva
    marcarLapida(idAbsorbido);          // que el merge entre equipos tampoco lo devuelva
    const { error: errBorrado } = await supabase.from('picking_pallets').delete().eq('id', idAbsorbido);
    if (errBorrado) return { ok: false, error: errBorrado.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
