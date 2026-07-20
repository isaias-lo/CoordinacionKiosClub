/**
 * Clave canónica para indexar guías por tienda, robusta a la variante Unicode del código.
 *
 * Los códigos con Ñ (37VIÑ Viña del Mar, 23PEÑ Peñalolén) pueden llegar en distinta forma
 * según la fuente: el catálogo estático y el calendario los tienen en NFC (Ñ = U+00D1),
 * pero `supabaseTiendasMap` usa el `codigo` crudo de la DB, que puede venir en NFD
 * (N + U+0303) o sin tilde (37VIN). Al mezclarse ambas fuentes en `tiendaByCod` aparecen
 * DOS entradas para la misma tienda; entonces `matchCodArchivo` guarda la guía bajo una
 * variante y la card la lee bajo la otra → la card no se marca en verde aunque la guía sí
 * se asignó.
 *
 * Indexar las guías por esta clave (mayúsculas, acentos removidos) hace que la escritura y
 * la lectura coincidan sin importar la variante. Para códigos sin Ñ es idempotente.
 */
export function guideKey(cod: string): string {
  return cod.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}
