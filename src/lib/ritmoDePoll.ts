// Cada cuánto consultar el estado compartido cuando el canal en vivo dice estar bien. Puro.
//
// El respaldo se apagaba por completo mientras el canal reportara "conectado":
//
//     const pollId = setInterval(async () => {
//       if (realtimeConnected) return;    // ← nunca más consulta
//       ...
//     }, 15_000);
//
// El diseño previó la caída ANUNCIADA: si el canal avisa que se cayó, el respaldo se reenciende.
// Lo que no previó es la caída MUDA — el canal queda unido y simplemente deja de traer eventos
// (reinicio o rebalanceo del servidor de tiempo real, throttle del tenant, la suscripción que se
// pierde del lado del servidor). Ahí nadie avisa nada: el estado sigue en "conectado" para
// siempre, el respaldo sigue apagado para siempre, y el equipo queda ciego para siempre.
//
// Y ciego se ve igual que "no pasó nada en bodega". Medido el 17/09: nueve pallets cargados dos
// veces, con 13 a 80 minutos de diferencia, nueve de ellos en el MISMO equipo.
//
// Por eso el respaldo deja de apagarse. Sigue siendo barato cuando el canal anda —una consulta por
// minuto en vez de cuatro— pero garantiza un piso: lo peor que puede pasar es enterarse un minuto
// tarde, en vez de no enterarse nunca.

/** Cada cuánto late el temporizador. El canal sano no necesita más que esto. */
export const TICK_MS = 15_000;

/** Ticks entre consultas cuando el canal dice estar bien: 4 × 15 s = 1 minuto. */
export const TICKS_CON_CANAL_SANO = 4;

/**
 * ¿Toca consultar en este tick?
 *
 * · Canal caído → en todos: es el respaldo de siempre, cada 15 s.
 * · Canal sano  → uno de cada cuatro: solo para detectar que el canal quedó mudo.
 *
 * `tick` empieza en 1 y crece de a uno. El primer tick con canal sano NO consulta: si el canal
 * acaba de conectarse, el estado ya se trajo al suscribirse.
 */
export function debeConsultar(canalSano: boolean, tick: number, cada = TICKS_CON_CANAL_SANO): boolean {
  if (!canalSano) return true;
  if (cada <= 0) return true;
  return tick > 0 && tick % cada === 0;
}
