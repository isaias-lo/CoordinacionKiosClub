import type { PickingSlot } from '../santiago/components/PickingSlotCards';

export interface CrearSlotBodegaInput {
  date: string;
  store_cod: string;
  tipo: string;
  contenido?: string;
}

export interface CrearSlotBodegaResult {
  slot?: PickingSlot;
  error?: string;
}

/**
 * Crea un slot de `picking_pallets` originado en Bodega (POST /api/picking-pallets/create-bodega),
 * para un pallet/bulto/contenedor/chocolate que Picking todavía no reportó.
 *
 * Antes CADA punto de llamada tragaba el error en silencio (`catch { *\/}`): si la creación
 * fallaba (el fallback no atómico del route colisiona con otra alta concurrente para la misma
 * tienda+tipo — ver RC-4), el ítem quedaba igual "confirmado" en el resumen local de Bodega
 * (toast de éxito, tarjeta guardada) pero SIN fila real en `picking_pallets` — invisible para
 * Seguimiento/Enrutador/Conteo de Flota. Esta función centraliza la llamada y SIEMPRE devuelve
 * el motivo del fallo, para que el caller decida bloquear el guardado en vez de continuar con
 * un pallet fantasma.
 */
export async function crearSlotBodega(input: CrearSlotBodegaInput): Promise<CrearSlotBodegaResult> {
  try {
    const res = await fetch('/api/picking-pallets/create-bodega', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, contenido: (input.contenido || 'hogar').toLowerCase() }),
    });
    const json = await res.json() as { data?: PickingSlot; error?: string };
    if (json.data) return { slot: json.data };
    return { error: json.error || 'el servidor no devolvió el pallet' };
  } catch {
    return { error: 'sin conexión' };
  }
}
