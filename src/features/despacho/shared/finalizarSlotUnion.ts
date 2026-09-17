import { supabase } from '@/lib/supabase';
import { unionRefs } from './unifyPallets';
import { marcarRecienBorrado } from './eliminarSlotPicking';

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
 *  · Decir si funcionó. Antes tragaba cualquier error en un `console.error` y seguía, así que una
 *    unión a medias —refs fusionadas, slot sin borrar— no se distinguía de una completa.
 *
 * `fire-and-forget` desde la UI: no bloquea, pero devuelve el resultado para que quien llama pueda
 * avisar si falló.
 */
export async function finalizarSlotUnion(
  idQueSobrevive: number,
  idAbsorbido: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!idQueSobrevive || !idAbsorbido) return { ok: false, error: 'faltan ids' };
  if (idQueSobrevive === idAbsorbido) return { ok: false, error: 'son el mismo slot' };
  try {
    const { data, error: errLectura } = await supabase
      .from('picking_pallets').select('id, refs').in('id', [idQueSobrevive, idAbsorbido]);
    if (errLectura) return { ok: false, error: errLectura.message };

    const refsDestino  = (data ?? []).find(d => d.id === idQueSobrevive)?.refs as string | undefined;
    const refsAbsorbido = (data ?? []).find(d => d.id === idAbsorbido)?.refs as string | undefined;
    const fusionadas = unionRefs(refsDestino, refsAbsorbido);
    // Las referencias van PRIMERO: si el borrado falla queda un slot de más (molesto, visible), y
    // no una unidad sin sus referencias de Odoo (silencioso, irrecuperable).
    if (fusionadas && fusionadas !== (refsDestino ?? '')) {
      const { error } = await supabase.from('picking_pallets').update({ refs: fusionadas }).eq('id', idQueSobrevive);
      if (error) return { ok: false, error: error.message };
    }

    marcarRecienBorrado(idAbsorbido);   // que la recarga de picking no lo reviva
    const { error: errBorrado } = await supabase.from('picking_pallets').delete().eq('id', idAbsorbido);
    if (errBorrado) return { ok: false, error: errBorrado.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
