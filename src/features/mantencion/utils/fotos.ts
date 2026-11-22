// Las fotos de una solicitud: cómo llegan, cuánto pueden pesar y dónde se guardan. Módulo puro.
//
// ── LLEGAN DENTRO DE LA SOLICITUD, COMO DATA URL ──────────────────────────────────────────────
//
// La pantalla del supervisor manda la solicitud y sus fotos en UN solo POST, y el servidor las
// sube al bucket. Es lo mismo que hace Recepción (`api/recepcion`), y por la misma razón: la
// solicitud también entra por la cola offline, y lo que se encola tiene que ser el envío completo.
// Subir las fotos primero y mandar las rutas después dejaría, sin señal, fotos subidas a medias de
// una solicitud que nunca llegó.
//
// ── EL TOPE ES DEL CUERPO ENTERO, NO SOLO DE CADA FOTO ────────────────────────────────────────
//
// Vercel corta las peticiones de más de 4,5 MB. Cinco fotos de 1 MB pasan cada una el tope por
// foto y aun así, en base64 (un tercio más), la solicitud no llega nunca: el supervisor ve que
// "no sale" y no sabe por qué. Por eso hay dos topes, y el de la suma es el que de verdad manda.
// Una foto comprimida con `processPhoto` (1280 px, calidad 0,8) pesa entre 150 y 400 KB.

/** Tope por foto, ya decodificada. */
export const MAX_BYTES_FOTO = 900_000;
/** Tope de la suma de las fotos de una solicitud, ya decodificadas. Ver la cabecera. */
export const MAX_BYTES_FOTOS_TOTAL = 3_000_000;

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
};

export type FotoLeida =
  | { ok: true; mime: string; extension: string; base64: string; bytes: number }
  | { ok: false; error: string };

/** Los bytes que ocupa un base64 una vez decodificado, sin decodificarlo. */
export function bytesDeBase64(base64: string): number {
  const limpio = base64.replace(/\s/g, '');
  if (!limpio) return 0;
  const relleno = limpio.endsWith('==') ? 2 : limpio.endsWith('=') ? 1 : 0;
  return Math.floor((limpio.length * 3) / 4) - relleno;
}

/**
 * Lee una foto que llegó como `data:image/jpeg;base64,...`.
 *
 * Solo JPEG, PNG y WebP: es lo que produce la cámara de un celular después de `processPhoto`. El
 * tipo se toma del encabezado del data URL, que es lo único que hay sin decodificar la imagen.
 */
export function leerFotoDataUrl(entrada: unknown): FotoLeida {
  if (typeof entrada !== 'string') return { ok: false, error: 'La foto no llegó' };
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(entrada.trim());
  if (!m) return { ok: false, error: 'La foto no es una imagen válida' };
  const mime = m[1].toLowerCase();
  const extension = EXTENSION[mime];
  if (!extension) return { ok: false, error: 'Solo se aceptan fotos JPG, PNG o WebP' };
  const base64 = m[2].replace(/\s/g, '');
  const bytes = bytesDeBase64(base64);
  if (bytes === 0) return { ok: false, error: 'La foto está vacía' };
  if (bytes > MAX_BYTES_FOTO) return { ok: false, error: 'Una de las fotos pesa demasiado' };
  return { ok: true, mime, extension, base64, bytes };
}

/** Lee todas las fotos y aplica también el tope de la suma. Devuelve todos los problemas juntos. */
export function leerFotos(entradas: readonly unknown[]):
  | { ok: true; fotos: Extract<FotoLeida, { ok: true }>[] }
  | { ok: false; errores: string[] } {
  const fotos: Extract<FotoLeida, { ok: true }>[] = [];
  const errores = new Set<string>();
  for (const e of entradas) {
    const f = leerFotoDataUrl(e);
    if (f.ok) fotos.push(f); else errores.add(f.error);
  }
  const total = fotos.reduce((s, f) => s + f.bytes, 0);
  if (total > MAX_BYTES_FOTOS_TOTAL) errores.add('Las fotos juntas pesan demasiado: quita alguna');
  return errores.size ? { ok: false, errores: [...errores] } : { ok: true, fotos };
}

/**
 * Dónde se guarda una foto dentro del bucket privado `mantencion-fotos`:
 * `AAAA/MM/<codigo_tienda>/<id_solicitud>/<nombre>.<ext>`.
 *
 * El orden por año, mes y tienda es el que va a tener la copia a Drive de la Fase 3, así que la
 * copia es un espejo de carpetas y no un trabajo aparte.
 *
 * El código de tienda pasa por la misma limpieza que `safeStorageKey`: Storage rechaza claves con
 * Ñ o acentos (23PEÑ), y el rechazo llega como un "Invalid key" que pierde la foto.
 */
export function rutaFoto(p: {
  /** Día de Chile en que se crea la solicitud, `YYYY-MM-DD`. */
  fecha: string;
  codigoTienda: string;
  solicitudId: string;
  nombre: string;
  extension: string;
}): string {
  const [anio, mes] = p.fecha.split('-');
  if (!/^\d{4}$/.test(anio ?? '') || !/^\d{2}$/.test(mes ?? '')) {
    throw new Error(`rutaFoto: fecha inválida «${p.fecha}»`);
  }
  const limpio = (s: string) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    // Sin puntos: así ningún tramo puede ser `..` y abrir otra carpeta.
    .replace(/[^A-Za-z0-9_-]/g, '_');
  const tienda = limpio(p.codigoTienda.trim().toUpperCase());
  if (!tienda) throw new Error('rutaFoto: falta el código de tienda');
  return `${anio}/${mes}/${tienda}/${limpio(p.solicitudId)}/${limpio(p.nombre)}.${limpio(p.extension)}`;
}
