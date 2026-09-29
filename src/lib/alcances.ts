/**
 * A qué operación concreta queda atado un comprobante de verificación del OTP.
 *
 * Vive aparte de `otpToken.ts` a propósito: ese importa `crypto` de Node y no puede entrar al
 * bundle del navegador. Acá no hay nada que no sea texto, así que la pantalla y el endpoint que
 * valida pueden construir el MISMO string desde el mismo lugar.
 *
 * Que sea el mismo importa más de lo que parece: si el cliente mandara `ruta_tienda:12` y el
 * servidor esperara `rt:12`, el comprobante nunca validaría, y el síntoma sería idéntico al bug
 * que esto viene a arreglar — la operación rechazada, la cola reintentando, nadie enterándose.
 *
 * Los prefijos además separan los dos flujos entre sí: un comprobante emitido para que el chofer
 * cierre una parada no sirve para que alguien confirme una recepción de tienda, ni al revés.
 */

/** La entrega de una parada puntual de la ruta del chofer. */
export function alcanceEntrega(rutaTiendaId: number): string {
  return `ruta_tienda:${rutaTiendaId}`;
}

/**
 * La recepción de una tienda.
 *
 * `canonicalId` identifica el despacho concreto que se está recibiendo y se incluye cuando existe,
 * para que el comprobante no sirva para confirmar otra recepción distinta de la misma tienda
 * dentro de las 72 horas que dura. Cuando el QR no lo trae, el alcance llega hasta la tienda, que
 * es todo lo que hay para identificar la operación.
 */
export function alcanceRecepcion(cod: string, canonicalId?: string | null): string {
  return canonicalId ? `recepcion:${cod}:${canonicalId}` : `recepcion:${cod}`;
}
