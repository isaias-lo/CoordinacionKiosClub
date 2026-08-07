/* ── Flujo de tiendas armadas en Bodega hacia el Enrutador ────────────────────
   Antes "el calendario manda": una tienda solo aparecía en el Enrutador si estaba en el
   calendario del día (excepción: la Oficina). Eso hacía que una tienda ARMADA en Bodega hoy
   (p. ej. 55ITA agregada desde Picking) no apareciera. Ahora cualquier tienda armada hoy con
   carga fluye al pool, colocada en su GRUPO (Regiones/Costa/Santiago). Helper puro. */

export type Grupo = 'fal' | 'costa' | 'rm';

/**
 * Grupo de una tienda armada, según la fuente de la sesión de Bodega y la región del catálogo:
 *  - fuente 'regiones' → 'fal' (Regiones)
 *  - región Viña/Costa ('VR'/'V') → 'costa'
 *  - resto → 'rm' (Santiago)
 */
export function grupoArmada(fuente: string | undefined | null, region: string | undefined | null): Grupo {
  if (fuente === 'regiones') return 'fal';
  if (region === 'VR' || region === 'V') return 'costa';
  return 'rm';
}
