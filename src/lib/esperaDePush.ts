// Cuánto esperar antes de empujar el estado de Bodega. Puro y testeable.
//
// El guardado es con debounce: se agenda 2,5 s después del último cambio, para no reescribir el
// blob entero en cada tecla. Eso está bien mientras los cambios son propios.
//
// Deja de estarlo cuando entran los cambios de OTRAS personas. Ahora que un remoto se fusiona en
// vez de ignorarse, cada fusión es un cambio de estado más — y con un debounce clásico cada una
// reiniciaría la cuenta. Con cinco personas empujando cada pocos segundos, el guardado propio
// podría no salir NUNCA: se cambiaría "borro lo del otro" por "lo mío no llega", que no es mejor.
//
// Por eso el debounce tiene tope: se sigue esperando a que amaine, pero nunca más allá de 2,5 s
// desde el PRIMER cambio pendiente. Es el patrón de "debounce con espera máxima".

export const DEBOUNCE_PUSH_MS = 2500;

/**
 * Milisegundos a esperar para el próximo push.
 *
 * `vencimiento` es el instante en que vence la espera del primer cambio pendiente, o `0` si no hay
 * ninguno en curso. Devuelve además el vencimiento a recordar, para que el llamador no tenga que
 * decidirlo.
 *
 * Nunca devuelve más que `maximo` ni menos que 0: un vencimiento ya pasado significa "empuja ya".
 */
export function esperaDePush(
  vencimiento: number,
  ahora: number,
  maximo: number = DEBOUNCE_PUSH_MS,
): { espera: number; vencimiento: number } {
  if (vencimiento <= 0) return { espera: maximo, vencimiento: ahora + maximo };
  return { espera: Math.max(0, Math.min(maximo, vencimiento - ahora)), vencimiento };
}
