// Escribir en la bitácora. Server-only: el actor sale del token, nunca del cliente.
//
// Si el cliente pudiera escribir acá, el registro dejaría de servir para responder qué pasó —
// que es lo único para lo que existe.

import { supabaseServer } from '@/lib/supabaseServer';
import { camposCambiados, resumenCambio, ENTIDADES, type Entidad, type AccionBitacora } from '@/lib/bitacora';

interface Registro {
  actor: { id: string; name: string } | null;
  entidad: Entidad;
  entidadId: string;
  accion: AccionBitacora;
  antes?: Record<string, unknown> | null;
  despues?: Record<string, unknown> | null;
}

/**
 * Deja constancia de un cambio. NO lanza y NO bloquea: si la bitácora falla, el cambio igual se
 * guardó, y perder una línea de registro es mucho menos grave que perderle a alguien una edición
 * por un problema de auditoría. El error queda en el log del servidor.
 *
 * Un "editar" que no cambió ningún campo no se registra: llenar el historial de líneas vacías
 * es la forma más rápida de que nadie lo lea.
 */
export async function registrarCambio(r: Registro): Promise<void> {
  try {
    const cambios = camposCambiados(r.antes, r.despues, ENTIDADES[r.entidad].campos);
    if (r.accion === 'editar' && cambios.length === 0) return;

    await supabaseServer().from('bitacora_cambios').insert({
      actor_id:   r.actor?.id   ?? null,
      actor_name: r.actor?.name ?? null,
      entidad:    r.entidad,
      entidad_id: r.entidadId,
      accion:     r.accion,
      resumen:    r.accion === 'eliminar' ? 'Eliminado' : resumenCambio(cambios),
      antes:      r.antes   ?? null,
      despues:    r.despues ?? null,
    });
  } catch (e) {
    console.error('[bitacora]', e);
  }
}
