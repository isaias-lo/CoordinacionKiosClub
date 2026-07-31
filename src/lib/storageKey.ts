/**
 * Clave de objeto segura para Supabase Storage.
 *
 * Supabase Storage RECHAZA claves con caracteres no-ASCII: subir `recep_23PEÑ_...jpg` (Peñalolén)
 * o `..._23PEÑ-...pdf` devuelve "Invalid key" → la foto/guía no sube y se pierde silenciosamente.
 * Esto rompía cualquier tienda con Ñ o acento en el código (verificado en prod: 23PEÑ).
 *
 * Normaliza los diacríticos (ñ→n, é→e, ú→u) y reemplaza cualquier otro carácter fuera de
 * [A-Za-z0-9._/-] por '_'. Conserva '/' para rutas con carpetas. Puro y testeable.
 */
export function safeStorageKey(name: string): string {
  return (name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita diacríticos combinados (ñ→n, é→e…)
    .replace(/[^A-Za-z0-9._/-]/g, '_');               // resto no-ASCII / espacios → _
}
