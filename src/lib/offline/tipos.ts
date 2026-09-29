/**
 * [Cola offline única] Lo que comparten las tres pantallas que registran trabajo sin señal.
 *
 * Antes de esto había dos colas escritas por separado: picking en localStorage (solo texto) y
 * conductor en IndexedDB (con los blobs de las fotos). Recepción no tenía ninguna. La de conductor
 * ya era la buena, así que la pieza compartida sale de ahí.
 *
 * Lo que se unifica es el ALMACÉN y la contabilidad de reintentos, no el envío: cada módulo manda
 * lo suyo a su endpoint, con sus pasos (el conductor sube fotos antes del PATCH final, picking hace
 * un POST y ya). Forzar un envío común habría sido inventar una abstracción que ninguno de los tres
 * pidió.
 */

export type ModuloOffline = 'picking' | 'conductor' | 'recepcion';

export interface ItemCola<P = unknown> {
  /** Clave del registro. Es también el `clientOpId` que viaja al servidor: ver abajo. */
  id: string;
  modulo: ModuloOffline;
  /**
   * Idempotencia. El reenvío usa SIEMPRE el mismo id, así que si la petición llegó al servidor y
   * lo que se perdió fue la respuesta, el reintento no crea un segundo registro. Picking ya lo
   * hacía (`client_op_id`); acá pasa a ser parte del contrato de la cola, no de cada módulo.
   */
  clientOpId: string;
  payload: P;
  intentos: number;
  ultimoError?: string;
  /**
   * El servidor rechazó esto por algo que reintentar no va a arreglar. Deja de reintentarse y el
   * módulo lo muestra en pantalla.
   *
   * Existe porque un rechazo definitivo y un corte de señal se veían idénticos desde acá: los dos
   * dejaban el ítem en la cola para el próximo intento, para siempre y sin que nadie se enterara.
   * La cola vive en el dispositivo, así que el rechazo no deja rastro en el servidor ni en Sentry.
   */
  bloqueado?: boolean;
  createdAt: number;
}
