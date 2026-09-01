// Detalle por tienda para la pantalla de solo lectura /conteo-flota (persona de flota
// externa). Reusa exactamente lo que ya calcula el motor incremental — `acumular()` para
// lo REAL contado hoy y `estadoTienda()` para el semáforo — sin inventar ninguna fórmula
// ni pedir ningún dato nuevo (cero llamadas a Odoo adicionales: todo sale de lo que Bodega
// ya trae vía picking_pallets + el historial que ya se consulta para el total).
//
// Puro y testeable: sin red, sin reloj propio.

import {
  acumular, estadoTienda, INCREMENTAL_DEFAULT,
  type UnidadSalida, type EsperadoTienda, type EstadoTienda, type OpcionesIncremental,
} from './enrutadorIncremental';
import { minutosAHHMM } from './parametrosMotor';

export interface FilaTiendaConteo {
  cod: string;
  /** Pallets/bultos/chocolates YA contados hoy (real, desde picking_pallets). */
  pallets: number;
  bultos: number;
  chocolates: number;
  /** Pallets adicionales que el historial dice que todavía faltan. 0 si `estado === 'completa'`
   *  (por definición ya no se espera más) — mismo criterio de reserva que usa el motor. */
  estimadoAdicional: number;
  /** Mismo semáforo de 3 niveles que ya usa TableroVivo para decidir cuándo cerrar un camión.
   *  Es ALGORÍTMICO, no una confirmación manual — todavía no existe el botón "Tienda
   *  Terminada" en Bodega (queda como tarea aparte). */
  estado: EstadoTienda;
  /** Por qué `estadoTienda` llegó a ese resultado, en texto llano — sin esto, "Completa"
   *  después de la hora de corte (15:00 por defecto: TODA tienda con carga se da por
   *  completa, la haya terminado Bodega o no) es indistinguible de "Completa" porque de
   *  verdad no hay más movimiento. La persona que mira esta pantalla no conoce las reglas
   *  internas del motor — el motivo se lo explica sin que tenga que preguntar. */
  detalle: string;
  /** true cuando `estado === 'completa'` SOLO porque ya pasó la hora de corte (15:00 por
   *  defecto) — no porque de verdad haya silencio confirmado tras alcanzar lo esperado. Es
   *  una señal mucho más débil ("todavía podría estar cargando") que merece un tratamiento
   *  visual distinto al "completa" genuino, para no darle al viewer más certeza de la que hay. */
  completaPorCorte: boolean;
}

/**
 * Arma una fila por cada tienda con actividad hoy (al menos una unidad contada), ordenadas
 * por código. `acumular(unidades)` ya cubre TODAS las tiendas con carga —  incluidas las que
 * el motor todavía no asignó a ningún camión — así que no hace falta cruzar con `PlanIncremental`.
 */
export function filasPorTienda(
  unidades: UnidadSalida[],
  historial: Record<string, EsperadoTienda>,
  ahora: number,
  opciones: OpcionesIncremental = {},
): FilaTiendaConteo[] {
  const o = { ...INCREMENTAL_DEFAULT, ...opciones };
  const acc = acumular(unidades);
  const cods = Object.keys(acc).sort();

  return cods.map(cod => {
    const it = acc[cod];
    const pallets = it.p + it.c_; // contenedores ocupan piso igual que un pallet (mismo criterio que planificarIncremental)
    const recibido = pallets + it.b + (it.ch ?? 0);
    const h = historial[cod];
    // `sinHistorial` solo se asume true cuando NO HAY entrada para la tienda — si la entrada
    // existe pero no marca el campo explícitamente, sí hay historial (mismo criterio que el
    // fallback de planificarIncremental, que solo aplica sinHistorial:true al construir el
    // objeto por defecto, no campo por campo).
    const sinHistorial = h ? (h.sinHistorial ?? false) : true;
    const estado = estadoTienda(recibido, h?.esperado ?? 0, it.ultimo, ahora, o, sinHistorial);
    const estimadoAdicional = estado === 'completa' ? 0 : Math.max(0, (h?.techoPallets ?? 0) - pallets);
    const detalle = detalleEstado(estado, { ahora, ultimo: it.ultimo, o, sinHistorial, recibido, esperado: h?.esperado ?? 0 });
    const completaPorCorte = estado === 'completa' && ahora >= o.corteCierre;
    return { cod, pallets, bultos: it.b, chocolates: it.ch ?? 0, estimadoAdicional, estado, detalle, completaPorCorte };
  });
}

function detalleEstado(
  estado: EstadoTienda,
  ctx: { ahora: number; ultimo: number; o: Required<Pick<OpcionesIncremental, 'corteCierre' | 'silencioMin' | 'umbralEmpresa'>>; sinHistorial: boolean; recibido: number; esperado: number },
): string {
  const { ahora, ultimo, o, sinHistorial, recibido, esperado } = ctx;
  const minsSinNovedad = Math.max(0, ahora - ultimo);
  if (estado === 'completa') {
    // Pasada la hora de corte, TODA tienda con carga se da por completa aunque Bodega no
    // haya terminado — es una regla operativa del motor (a esa hora ya salió ~86% del día),
    // no una confirmación de que esta tienda en particular ya cerró.
    if (ahora >= o.corteCierre) return `Corte del día (después de las ${minutosAHHMM(o.corteCierre)})`;
    return `Sin novedad hace ${minsSinNovedad} min`;
  }
  if (estado === 'probable') {
    return `Alcanzó lo esperado hace ${minsSinNovedad} min — confirmando`;
  }
  // esperando
  if (sinHistorial) return 'Sin historial — se espera hasta el corte del día';
  if (recibido === 0) return 'Sin movimiento todavía';
  return `Recibido ${recibido} de ${esperado} esperado`;
}
