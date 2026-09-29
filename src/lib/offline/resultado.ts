import type { ItemCola } from './tipos';

/**
 * Qué hacer con un ítem después de intentar enviarlo.
 *
 * `reintentar` y `bloqueado` no son lo mismo y confundirlos es exactamente el bug que esto viene a
 * cerrar: mientras los dos casos se trataban igual, un rechazo definitivo se reintentaba para
 * siempre y la persona seguía viendo su trabajo como registrado.
 */
export type Veredicto = 'ok' | 'reintentar' | 'bloqueado';

/**
 * Códigos 4xx que SÍ conviene reintentar, aunque sean del lado del cliente:
 *
 *  - 408 Request Timeout y 425 Too Early: la petición no llegó a procesarse.
 *  - 429 Too Many Requests: es "ahora no", no "esto está mal".
 *
 * Tratarlos como definitivos le borraría el trabajo a alguien por un pico de tráfico.
 */
const REINTENTABLES_4XX = new Set([408, 425, 429]);

export function clasificarEstado(status: number): Veredicto {
  if (status >= 200 && status < 300) return 'ok';
  if (status >= 400 && status < 500) {
    return REINTENTABLES_4XX.has(status) ? 'reintentar' : 'bloqueado';
  }
  // 5xx y cualquier cosa rara: el servidor se cayó o respondió algo que no entendemos. Reintentar
  // es lo seguro — el trabajo de la persona no se descarta por un problema que no es suyo.
  return 'reintentar';
}

export type Accion<P> =
  | { tipo: 'eliminar' }
  | { tipo: 'guardar'; item: ItemCola<P> };

/**
 * Cómo queda el ítem según el veredicto. Puro a propósito: es la regla que decide si el trabajo de
 * alguien se borra, y tiene que poder probarse sin IndexedDB ni red de por medio.
 */
export function siguienteEstado<P>(
  item: ItemCola<P>,
  veredicto: Veredicto,
  mensaje?: string,
): Accion<P> {
  if (veredicto === 'ok') return { tipo: 'eliminar' };
  return {
    tipo: 'guardar',
    item: {
      ...item,
      intentos: item.intentos + 1,
      ultimoError: mensaje,
      // Solo se marca, nunca se desmarca: un ítem bloqueado ya no se vuelve a intentar, así que no
      // hay veredicto posterior que pueda devolverlo a la cola.
      ...(veredicto === 'bloqueado' ? { bloqueado: true } : {}),
    },
  };
}

/** Los que todavía van a intentarse. Un bloqueado ocupa lugar en la cola pero ya no se manda. */
export function pendientesDeEnvio<P>(items: ItemCola<P>[]): ItemCola<P>[] {
  return items.filter(i => !i.bloqueado);
}

/**
 * Los que hay que mostrarle a la persona en rojo, porque nadie más se va a enterar.
 *
 * Se cuentan aparte de los pendientes: el contador de "sin enviar" se reintenta al tocarlo, y un
 * bloqueado no se mueve. Sumarlo ahí dejaría un número que nunca baja, que es otra forma de la
 * misma falla callada.
 */
export function bloqueados<P>(items: ItemCola<P>[]): ItemCola<P>[] {
  return items.filter(i => !!i.bloqueado);
}
