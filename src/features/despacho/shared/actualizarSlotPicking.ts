import { supabase } from '@/lib/supabase';

// Escribir en un slot de `picking_pallets` sabiendo si el slot TODAVÍA EXISTE.
//
// ── POR QUÉ HACE FALTA ─────────────────────────────────────────────────────────────────────────
//
// Un `update ... .eq('id', slotId)` sobre una fila que ya no está **no da error**: Postgres afecta
// cero filas y devuelve éxito. Así que toda la aplicación podía escribirle a una unidad borrada y
// mostrar un «✓ agregado» verde.
//
// Pasó en 12LAS el 30/09, con dos personas sobre la misma tienda:
//
//     16:44:06  Sebastián suma el CH1 al pallet  →  el slot 605 se BORRA
//     16:48:35  Isaías registra «CH1 · 11,9 kg»  →  al slot 605, que ya no existe
//     16:48:36  Isaías registra «CH2 · 0,4 kg»   →  al slot 606, ídem
//
// Las dos veces la pantalla dijo que se había guardado. En `picking_pallets` no quedó nada, y la
// tarjeta desaparece sola en cuanto alguien recarga la tienda — porque el formulario se rearma
// desde los slots, y esos slots no están.
//
// ── QUÉ HACE, Y QUÉ NO ─────────────────────────────────────────────────────────────────────────
//
// Pide las filas afectadas con `.select('id')` y responde si hubo alguna. **No revierte nada**: el
// ítem ya está en el estado local y quitárselo a la persona mientras escribe sería peor. Lo que
// cambia es que se puede AVISAR, y el aviso dice lo único que arregla la situación: recargar la
// tienda, que vuelve a traer los slots de verdad.
//
// Es el mismo criterio que `finalizarSlotUnion` desde el #638: una operación contra una unidad que
// ya no existe tiene que fallar en voz alta, no en silencio.

export interface ResultadoUpdateSlot {
  /** La fila existía y se actualizó. */
  ok: boolean;
  /** El slot ya no está en `picking_pallets` — otro equipo lo borró, unió o sumó. */
  yaNoExiste: boolean;
  /** Error real de la base, si lo hubo. Distinto de `yaNoExiste`. */
  error?: string;
}

/** El aviso, en un solo lugar: lo muestran los dos espejos con el mismo texto. */
export const AVISO_SLOT_BORRADO =
  '⚠ Esa unidad ya no existe en Picking — otro equipo la borró o la unió. Recarga la tienda.';

/**
 * Actualiza un slot y dice si existía.
 *
 * `campos` va tal cual al `update`. Sin `slotId` es un no-op seguro: devuelve `ok` en false y
 * `yaNoExiste` en false, porque no se pidió escribir en ninguna unidad.
 */
export async function actualizarSlotPicking(
  slotId: number | null | undefined,
  campos: Record<string, unknown>,
): Promise<ResultadoUpdateSlot> {
  if (!slotId) return { ok: false, yaNoExiste: false };
  try {
    const { data, error } = await supabase
      .from('picking_pallets').update(campos).eq('id', slotId).select('id');
    if (error) return { ok: false, yaNoExiste: false, error: error.message };
    const afectadas = data?.length ?? 0;
    return { ok: afectadas > 0, yaNoExiste: afectadas === 0 };
  } catch (e) {
    return { ok: false, yaNoExiste: false, error: e instanceof Error ? e.message : String(e) };
  }
}
