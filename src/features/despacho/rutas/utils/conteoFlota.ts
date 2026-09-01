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
    return { cod, pallets, bultos: it.b, chocolates: it.ch ?? 0, estimadoAdicional, estado };
  });
}
