// Normalización del código de tienda al sincronizar el Sheet → Supabase.
// Puro (sin dependencias) para poder testearlo.

/**
 * Normaliza el código a mayúsculas y quita acentos de vocales, pero CONSERVA la Ñ.
 *
 * El código canónico en toda la app (schema StoreCodeSchema, write-back POST /api/tiendas,
 * catálogo, Odoo, guías, calendario) usa Ñ — ej. 23PEÑ, 37VIÑ. Si aquí se hiciera Ñ→N, la
 * sync guardaría "23PEN" como fila DISTINTA de "23PEÑ" → la tienda se duplicaría en Supabase
 * y en el Google Sheet. Por eso la Ñ NO se toca.
 */
export function normalizeCod(raw: string): string {
  return raw.trim().toUpperCase()
    .replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E')
    .replace(/[ÍÌÎÏ]/g, 'I').replace(/[ÓÒÔÖ]/g, 'O')
    .replace(/[ÚÙÛÜ]/g, 'U');
}

/** Código válido: 0-2 dígitos, 2-5 letras (Ñ permitida, ej. 23PEÑ), dígito final opcional. */
export const COD_RE = /^[0-9]{0,2}[A-ZÑ]{2,5}[0-9]?$/;
