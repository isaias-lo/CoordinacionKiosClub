/* ── Flujo de tiendas armadas en Bodega hacia el Enrutador ────────────────────
   Antes "el calendario manda": una tienda solo aparecía en el Enrutador si estaba en el
   calendario del día (excepción: la Oficina). Eso hacía que una tienda ARMADA en Bodega hoy
   (p. ej. 55ITA agregada desde Picking) no apareciera. Ahora cualquier tienda armada hoy con
   carga fluye al pool, colocada en su GRUPO (Regiones/Costa/Santiago). Helper puro. */

import { grupoDeSector } from '@/lib/sectores';

export type Grupo = 'fal' | 'costa' | 'rm';

/**
 * Grupo de una tienda armada, según la fuente de la sesión de Bodega y su SECTOR:
 *  - fuente 'regiones' → 'fal' (Regiones), sin mirar nada más
 *  - resto → lo que diga el sector ('Costa' → costa, 'Región…' → fal, corredores → rm)
 *
 * Antes decidía por REGIÓN, comparando contra 'VR'/'V'. Ese es el vocabulario del catálogo de
 * Santiago, pero acá llega el de rutas, que escribe 'Valparaíso': la rama de Costa NUNCA se
 * ejecutaba y las cinco tiendas de la V Región caían en 'rm'. No se notaba porque 'rm' y 'costa'
 * comparten pool y tabla de registro — solo cambiaba bajo qué filtro se veían.
 *
 * El sector es el campo que DECLARA el ruteo; la región es cómo se llama el lugar. Preguntarle al
 * sector arregla la rama muerta y de paso saca al armado de depender de un campo de etiqueta.
 */
export function grupoArmada(fuente: string | undefined | null, sector: string | undefined | null): Grupo {
  if (fuente === 'regiones') return 'fal';
  return grupoDeSector(sector) ?? 'rm';
}
