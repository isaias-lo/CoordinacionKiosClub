/**
 * A qué entrega queda atado un comprobante de verificación del OTP.
 *
 * Vive aparte de `otpToken.ts` a propósito: ese importa `crypto` de Node y no puede entrar al
 * bundle del navegador. Acá no hay nada que no sea texto, así que el formulario del chofer y el
 * endpoint que valida pueden construir el MISMO string desde el mismo lugar.
 *
 * Que sea el mismo importa más de lo que parece: si el cliente mandara `ruta_tienda:12` y el
 * servidor esperara `rt:12`, el comprobante nunca validaría, y el síntoma sería idéntico al bug
 * que esto viene a arreglar — la entrega rechazada, la cola reintentando, nadie enterándose.
 */
export function alcanceEntrega(rutaTiendaId: number): string {
  return `ruta_tienda:${rutaTiendaId}`;
}
