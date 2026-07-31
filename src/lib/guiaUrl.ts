/**
 * Href correcto para abrir el PDF de una guía.
 *
 * `drive_url` HOY es una URL completa (Supabase Storage: `https://…/storage/v1/object/public/guides/…pdf`).
 * En el pasado la columna guardaba solo el fileId de Google Drive, y varias vistas lo envolvían como
 * `https://drive.google.com/file/d/<fileId>/view`. Al migrar a Storage, ese envoltorio metía la URL
 * completa DENTRO de la ruta de Drive → Google respondía "Archivo no encontrado".
 *
 * Regla: si ya es http(s), se usa tal cual; si es un fileId pelado (legado), se envuelve como Drive.
 * Puro y testeable.
 */
export function guiaHref(driveUrl: string | null | undefined): string {
  const v = (driveUrl ?? '').trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://drive.google.com/file/d/${v}/view`;
}
