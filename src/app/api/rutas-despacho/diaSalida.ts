/**
 * [Panel Conductor] El chofer busca su ruta por el día en que SALE, no por el de armado.
 *
 * `rutas_despacho.fecha` es el día de ARMADO (de ahí cuelgan `codigo_ruta` y la idempotencia del
 * POST) y `fecha_salida` el día en que el camión va a las tiendas. Desde que existe `fecha_salida`
 * el Enrutador cierra los camiones el día ANTES de que salgan: medido el 30/10/2026, las 33
 * combinaciones de octubre tienen `fecha_salida = fecha + 1`, sin excepción. /conductor-hub
 * buscaba por `fecha = hoy`, así que el día en que el chofer sale no encontraba nada (su ruta
 * estaba guardada bajo ayer), y la tarde anterior veía como "hoy" la de mañana.
 *
 * Las filas viejas, de antes de la migración `add_fecha_salida_a_rutas_despacho`, no tienen
 * `fecha_salida`: para esas el día de armado ES el de salida, como se trabajaba entonces.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function diaDeSalida(r: { fecha: string; fecha_salida?: string | null }): string {
  return r.fecha_salida || r.fecha;
}

/**
 * Filtro `or` de PostgREST para "las rutas que salen el día `fechaISO`". Devuelve null si la fecha
 * no es YYYY-MM-DD: el valor va pegado dentro del filtro, así que no se arma con texto libre.
 */
export function filtroDiaSalida(fechaISO: string): string | null {
  if (!ISO.test(fechaISO)) return null;
  return `fecha_salida.eq.${fechaISO},and(fecha_salida.is.null,fecha.eq.${fechaISO})`;
}

export interface DiaHistorial { fecha: string; rutas: number; paradas: number; entregadas: number }

/**
 * Agrupa las rutas de un chofer por día de SALIDA y deja solo las que salieron entre `desde` y
 * `hasta` (inclusive). El GET trae por día de armado con margen hacia atrás —lo del viernes sale
 * el lunes—, así que el recorte fino por día de salida se hace acá.
 */
export function historialPorSalida(
  rows: { fecha: string; fecha_salida?: string | null; ruta_tiendas?: { estado_entrega: string }[] }[],
  desde: string,
  hasta: string,
): DiaHistorial[] {
  const porDia = new Map<string, Omit<DiaHistorial, 'fecha'>>();
  for (const r of rows) {
    const dia = diaDeSalida(r);
    if (dia < desde || dia > hasta) continue;
    const cur = porDia.get(dia) ?? { rutas: 0, paradas: 0, entregadas: 0 };
    const paradas = r.ruta_tiendas ?? [];
    cur.rutas += 1;
    cur.paradas += paradas.length;
    cur.entregadas += paradas.filter(p => p.estado_entrega === 'entregado').length;
    porDia.set(dia, cur);
  }
  return [...porDia.entries()]
    .map(([fecha, v]) => ({ fecha, ...v }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}
