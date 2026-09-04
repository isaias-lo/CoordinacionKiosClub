// Qué tiendas de Congelados ya se registraron hoy.
//
// Antes esto era una lista en `localStorage`, así que la marca ✓ Registrado era POR DISPOSITIVO:
// alguien registraba desde el computador y en la tablet del andén esas tiendas seguían apareciendo
// como si nadie las hubiera tocado. Dos personas podían registrar la misma tienda dos veces.
//
// No hace falta guardar la marca en ningún lado: el hecho YA está en la base. `pushCounts` escribe
// las cantidades en `despacho_sesion` con la fuente de la zona, así que "está registrada" es
// simplemente "tiene cantidades ahí". Derivarlo en vez de copiarlo evita que las dos cosas se
// separen — que es justo lo que venía pasando en todo el resto del sistema.

import type { ZonaCongelados } from './congeladosGrid';

export interface FilaSesion {
  fuente?: string | null;
  tienda_cod: string;
  pallets?: number | null;
  bultos?: number | null;
  contenedores?: number | null;
  chocolates?: number | null;
}

/** La fuente de `despacho_sesion` que le corresponde a cada zona. */
export function fuenteDeZona(zona: ZonaCongelados): string {
  return zona === 'nacional' ? 'congelados-regiones' : 'congelados-santiago';
}

/**
 * Las tiendas de esta zona que ya tienen cantidades registradas.
 *
 * Una fila en cero NO cuenta: registrar y después dejar la tienda en cero es lo mismo que no
 * haberla registrado — si contara, quedaría marcada como lista sin llevar nada.
 */
export function registradasDesdeSesion(
  filas: FilaSesion[],
  zona: ZonaCongelados,
): Set<string> {
  const fuente = fuenteDeZona(zona);
  const out = new Set<string>();
  for (const f of filas ?? []) {
    if ((f?.fuente ?? '') !== fuente) continue;
    const total = (f.pallets ?? 0) + (f.bultos ?? 0) + (f.contenedores ?? 0) + (f.chocolates ?? 0);
    if (total > 0) out.add(f.tienda_cod);
  }
  return out;
}
