// Qué día pedirle a Odoo para cada tienda de la pantalla. PURO.
//
// ── EL PROBLEMA ───────────────────────────────────────────────────────────────────────────────
//
// Picking pide los movimientos de TODAS sus tiendas en una sola llamada, y esa llamada lleva UN
// día. Mientras todas trabajen el mismo, perfecto. Una apertura rompe eso: 62PLD necesita el
// viernes 30 y las otras treinta necesitan hoy.
//
// ── POR QUÉ NO SE RESUELVE PIDIENDO UN RANGO ──────────────────────────────────────────────────
//
// Porque entonces cada tienda recibiría movimientos de días que no le tocan. El 31/10 había 17
// movimientos normales rezagados, de quince tiendas del calendario: con un rango, esas quince
// habrían visto carga vieja mezclada con la de hoy sin ninguna forma de distinguirla.
//
// Se agrupa: una llamada por día, con las tiendas que de verdad lo necesitan. Como las aperturas
// son una o dos por vez, eso es una o dos llamadas de más — y el día normal, cuando no hay
// ninguna, sigue siendo UNA sola, exactamente como antes.

/** Una consulta a Odoo: un día y las tiendas que lo piden. */
export interface ConsultaPorDia {
  dia: string;
  cods: string[];
}

/**
 * Agrupa las tiendas por el día que cada una necesita.
 *
 * `aperturas` es `cod → día de sus movimientos`. Una tienda que no está ahí usa `hoy`, que es el
 * caso de todas salvo las pocas de apertura.
 *
 * El grupo de `hoy` va PRIMERO aunque esté vacío de aperturas: es el que llena la pantalla, y
 * pedirlo antes hace que lo normal aparezca sin esperar a lo excepcional.
 */
export function agruparConsultasPorDia(
  cods: readonly string[],
  aperturas: ReadonlyMap<string, string> | null | undefined,
  hoy: string,
): ConsultaPorDia[] {
  const porDia = new Map<string, string[]>();
  for (const bruto of cods) {
    const cod = String(bruto ?? '').trim().toUpperCase();
    if (!cod) continue;
    const pedido = aperturas?.get(cod);
    // Un día mal formado se ignora y la tienda cae en hoy: nunca deja de pedirse.
    const dia = pedido && /^\d{4}-\d{2}-\d{2}$/.test(pedido) ? pedido : hoy;
    const lista = porDia.get(dia) ?? [];
    if (!lista.includes(cod)) lista.push(cod);
    porDia.set(dia, lista);
  }

  return [...porDia.entries()]
    .map(([dia, lista]) => ({ dia, cods: lista }))
    .sort((a, b) => (a.dia === hoy ? -1 : b.dia === hoy ? 1 : b.dia.localeCompare(a.dia)));
}

/** `true` si todas las tiendas trabajan el mismo día: el camino de siempre, sin llamadas de más. */
export function esUnSoloDia(consultas: readonly ConsultaPorDia[]): boolean {
  return consultas.length <= 1;
}
