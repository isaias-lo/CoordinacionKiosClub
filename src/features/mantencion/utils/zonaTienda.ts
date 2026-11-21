// La zona de una tienda, con las etiquetas que usa Mantención. Módulo puro.
//
// ── NO DUPLICA LA REGLA, LA ENVUELVE ──────────────────────────────────────────────────────────
//
// Qué zona le toca a un sector lo decide `src/lib/sectores.ts`, y ahí se queda. Ese archivo dice
// por qué: «una sola definición para el formulario y el motor», y un typo en el sector cambia de
// camión a una tienda. Una segunda copia acá se separaría de la primera sin que nadie se entere.
//
// Lo único de Mantención es cómo se LLAMAN esas zonas en pantalla: el Enrutador habla de
// `santiago`, `costa`, `sur` y `norte`; acá se muestran como RM, Costa, Ruta Sur y Ruta Norte.
// Eso es una traducción, no una regla.
//
// ── «REGIÓN» A SECAS NECESITA LA LATITUD ──────────────────────────────────────────────────────
//
// Las fichas cargadas antes de que Regiones se partiera en sur y norte dicen «Región» a secas, y
// entonces la zona sale de la latitud contra la del CD. Por eso se usa `zonaDeSectorOGeo` y no
// `zonaDeSector`: la segunda devuelve `null` en ese caso y la tienda quedaría sin zona.

import { zonaDeSectorOGeo, type ZonaRuteo } from '@/lib/sectores';

/** Las cuatro zonas, en el orden en que se muestran en el filtro del tablero. */
export const ZONAS_MANTENCION: ZonaRuteo[] = ['santiago', 'costa', 'sur', 'norte'];

const ETIQUETA: Record<ZonaRuteo, string> = {
  santiago: 'RM',
  costa:    'Costa',
  sur:      'Ruta Sur',
  norte:    'Ruta Norte',
};

/** Cómo se llama una zona en Mantención. */
export function etiquetaZona(zona: ZonaRuteo): string {
  return ETIQUETA[zona];
}

/**
 * La zona de una tienda, o `null` si no se puede saber.
 *
 * `null` no es un error: una tienda sin sector cargado existe, y el tablero la muestra igual bajo
 * «Sin zona». Inventarle una la mandaría a un filtro donde nadie la busca.
 */
export function zonaDeTienda(
  sector: string | null | undefined,
  lat?: number | null,
): ZonaRuteo | null {
  return zonaDeSectorOGeo(sector, lat ?? null);
}

/** La etiqueta de una tienda directamente, con su texto para cuando no hay zona. */
export function etiquetaZonaDeTienda(
  sector: string | null | undefined,
  lat?: number | null,
): string {
  const z = zonaDeTienda(sector, lat);
  return z ? etiquetaZona(z) : 'Sin zona';
}
