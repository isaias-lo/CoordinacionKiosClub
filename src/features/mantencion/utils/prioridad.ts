// En qué orden Jesús mira las tiendas. Módulo puro: entran números, sale un puntaje.
//
// ── LA FÓRMULA ────────────────────────────────────────────────────────────────────────────────
//
//     puntaje = peso_urgente × urgentes
//             + sin_programar
//             + días_de_la_más_antigua ÷ días_por_solicitud
//
// Las tres partes miden cosas distintas y por eso se suman en vez de elegir una:
//
//   · **urgentes** — una urgencia pesa varias solicitudes normales. Cuánto, lo decide Jesús en
//     `mant_config` (`peso_urgente`, hoy 5): es una regla de negocio, no una constante del
//     código.
//   · **sin programar** — el volumen que todavía no tiene fecha. Lo que ya está programado no
//     empuja: alguien se va a hacer cargo.
//   · **antigüedad** — la solicitud más vieja, dividida por `dias_por_solicitud` (hoy 2) para
//     traducir días a «cuántas solicitudes equivale esperar tanto». Sin esto, una tienda con un
//     solo problema de hace tres semanas queda siempre al fondo detrás de las ruidosas.
//
// ── UNA TIENDA SIN NADA PENDIENTE VA AL FONDO, Y NO POR CASUALIDAD ────────────────────────────
//
// Da cero porque sus tres términos son cero. No hace falta un caso especial, pero sí hace falta
// que el llamador NO ordene al revés: con `sort` descendente, cero es el último lugar.

/** Lo que hace falta saber de una tienda para ordenarla. */
export interface ResumenTienda {
  /** Solicitudes abiertas marcadas urgentes. */
  urgentes: number;
  /** Abiertas que todavía no tienen fecha de visita. */
  sinProgramar: number;
  /** Días de la más antigua sin cerrar. 0 si no hay ninguna. */
  diasMasAntigua: number;
}

/** Los dos números de `mant_config` que entran en el puntaje. */
export interface PesosPrioridad {
  /** Cuántas solicitudes normales vale una urgente. */
  pesoUrgente: number;
  /** Cuántos días de espera equivalen a una solicitud. Nunca cero: sería dividir por cero. */
  diasPorSolicitud: number;
}

export const PESOS_POR_DEFECTO: PesosPrioridad = { pesoUrgente: 5, diasPorSolicitud: 2 };

/** Redondeo a dos decimales sin arrastrar el error binario de `toFixed`. */
const dos = (n: number): number => Math.round(n * 100) / 100;

/**
 * El puntaje de una tienda. Más alto, más arriba en el tablero.
 *
 * `diasPorSolicitud` en cero o negativo se ignora y se usa el valor por defecto: es un dato que
 * Jesús edita a mano en una pantalla, y un cero ahí convertiría el puntaje de TODAS las tiendas
 * en `Infinity`, que es un tablero sin orden y sin ningún mensaje de error.
 */
export function puntajePrioridad(
  t: ResumenTienda,
  pesos: PesosPrioridad = PESOS_POR_DEFECTO,
): number {
  const urgentes = Math.max(0, Number(t.urgentes) || 0);
  const sinProgramar = Math.max(0, Number(t.sinProgramar) || 0);
  const dias = Math.max(0, Number(t.diasMasAntigua) || 0);

  const porUrgente = Number(pesos.pesoUrgente) || 0;
  const porDia = Number(pesos.diasPorSolicitud) > 0
    ? Number(pesos.diasPorSolicitud)
    : PESOS_POR_DEFECTO.diasPorSolicitud;

  return dos(porUrgente * urgentes + sinProgramar + dias / porDia);
}

/**
 * Las tiendas ordenadas de mayor a menor puntaje.
 *
 * El empate se rompe por código de tienda y no se deja al azar: dos tiendas con el mismo puntaje
 * tienen que salir siempre en el mismo orden, o el tablero se reacomoda solo en cada refresco y
 * se pierde el lugar que uno estaba mirando.
 */
export function ordenarPorPrioridad<T extends ResumenTienda & { codigoTienda: string }>(
  tiendas: readonly T[],
  pesos: PesosPrioridad = PESOS_POR_DEFECTO,
): Array<T & { puntaje: number }> {
  return tiendas
    .map(t => ({ ...t, puntaje: puntajePrioridad(t, pesos) }))
    .sort((a, b) => b.puntaje - a.puntaje || a.codigoTienda.localeCompare(b.codigoTienda));
}
