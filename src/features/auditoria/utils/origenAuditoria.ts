// De qué sección es un movimiento de Odoo, para rellenar la auditoría. PURO.
//
// ── POR QUÉ NO ALCANZA CON BUSCAR EL TEXTO ────────────────────────────────────────────────────
//
// Acá se buscaba `'Abastecimiento Comida'` con las dos palabras PEGADAS. Una apertura dice
// `'Abastecimiento Apertura Comida'`, con la palabra en medio, así que no coincidía ninguna y el
// formulario quedaba sin su código de operación.
//
// Es el TERCER sitio con el mismo agujero: `parseOrigin` (#768), `isAbastecimientoOp` (#772) y
// este. Los tres salieron de la misma lista de keywords pegados, y los tres se encontraron de a
// uno, cuando el anterior ya debería haber hecho buscar los demás —que es exactamente lo que
// `CLAUDE.md` manda hacer al agregar una clase—. Por eso la respuesta vive ahora en UNA función
// (`categoriaDeOrigin`) y acá solo se traduce al vocabulario de la auditoría.

import { categoriaDeOrigin } from '@/features/despacho/shared/aperturaOdoo';
import type { SubTipo } from '../types';

/** Las categorías de Odoo que la auditoría sabe auditar. Chocolates y congelados no entran. */
const CATEGORIA_A_SUBTIPO: Readonly<Record<string, SubTipo>> = {
  Comida: 'comida',
  Aseo:   'aseo',
  Hogar:  'hogar',
};

/**
 * La sección de un `origin`, o `null` si no es una que la auditoría cubra.
 *
 * `null` para chocolates y congelados es deliberado y es el comportamiento de siempre: esas no se
 * auditan por acá, así que no tienen casilla que rellenar.
 */
export function subtipoDeOrigin(origin: string | null | undefined): SubTipo | null {
  const cat = categoriaDeOrigin(origin);
  return cat ? CATEGORIA_A_SUBTIPO[cat] ?? null : null;
}
