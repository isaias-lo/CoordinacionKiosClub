import qrcode from 'qrcode-generator';

/* ── QR generado LOCALMENTE (sin servicio externo) ───────────────────────────
   Antes los manifiestos usaban api.qrserver.com para pintar el QR: si ese servicio
   se caía o iba lento, el QR no se imprimía y el fiscalizador se quedaba sin código
   que escanear (además el token de la ruta viajaba a un tercero). Esto genera el QR
   en el propio dispositivo y lo devuelve como data URI, para incrustarlo en un <img>.
   Función pura (sin red ni React) → testeable. */

/**
 * Devuelve un data URI (GIF) con el QR del `value`.
 * `cellSize` = px por módulo; se combina con el tamaño del <img> en el HTML.
 */
export function qrDataUri(value: string, cellSize = 4, margin = 0): string {
  const qr = qrcode(0, 'M'); // typeNumber 0 = auto; corrección de errores media
  qr.addData(value);
  qr.make();
  return qr.createDataURL(cellSize, margin);
}
