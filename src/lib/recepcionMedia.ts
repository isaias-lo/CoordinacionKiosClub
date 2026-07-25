/* ── Helpers puros de recepción (firma + fotos) ──────────────────────────────
   Sin UI ni red: reciben datos y devuelven datos. Se testean en __tests__.
   Usados por /api/recepcion (subida de fotos, acuse) y por la galería pública. */

/** Máximo de fotos de recepción que la tienda puede adjuntar. */
export const RECEP_MAX_FOTOS = 8;

export interface ParsedDataUrl {
  base64:      string;
  contentType: string; // ej. 'image/jpeg'
  ext:         string;  // ej. 'jpg'
}

/**
 * Parsea un data URL base64 de imagen (png/jpg/webp) en sus partes.
 * Devuelve null si el formato no es un data URL de imagen soportado.
 * No usa Buffer para poder testearse en cualquier entorno.
 */
export function parseDataUrl(dataUrl: unknown): ParsedDataUrl | null {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:(image\/(png|jpe?g|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const base64 = m[3].replace(/\s+/g, '');
  if (!base64) return null;
  const contentType = m[1].toLowerCase();
  const raw = m[2].toLowerCase();
  const ext = raw === 'jpeg' ? 'jpg' : raw;
  return { base64, contentType, ext };
}

/** Etiqueta legible del acuse de recibo según la elección conforme/con observaciones. */
export function acuseLabel(recibiConforme: boolean): string {
  return recibiConforme ? 'Recibí conforme' : 'Recibí con observaciones';
}

/**
 * Valida el id de recepción que viene en la URL de la galería.
 * El id es un entero positivo (bigint autoincrement). Devuelve el número o null.
 */
export function parseRecepcionId(raw: unknown): number | null {
  const s = String(raw ?? '').trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
