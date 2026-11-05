// Qué tiendas del día ya van en un camión, y en cuál. Puro y testeable.
//
// Isaias, 05/11/2026: «cuando algunas tiendas ya estén cargadas en un camión, que salgan en otro
// color (morado) y que diga que se cargó en un camión con tal patente».
//
// «Cargada» = su camión se CERRÓ en el Enrutador: cerrar emite el manifiesto y el QR y lo guarda en
// `rutas_despacho` (con sus tiendas en `ruta_tiendas`). Es la única marca de carga que existe; la
// patente que trae la planilla (`despacho_rm.patente`) es solo la asignación del tablero y puede
// cambiar hasta que el camión se cierra.
//
// `rutas_despacho.fecha` es el día de ARMADO (ver la ruta POST de /api/rutas-despacho), el mismo
// día que trabaja Bodega, así que se cruza directo con la lista de hoy.
//
// Un mismo camión puede quedar guardado dos veces (se cerró, se reabrió y se volvió a cerrar, o
// «Guardar (N)» se apretó dos veces): el 04/11 26ALC y 56PZA salen en RUTA-05 y RUTA-10, las dos
// en RGZJ70. Y si a una tienda la movieron de camión, el manifiesto viejo no se borra. Por eso
// manda el ÚLTIMO manifiesto que la nombra.
//
// Congelados va aparte: su camión no lleva el seco de la tienda. Bodega seco ignora esas rutas.

export interface RutaCargada {
  patente: string | null;
  codigo_ruta?: string | null;
  tipo?: string | null;
  created_at: string;
  ruta_tiendas?: { store_cod: string | null }[] | null;
}

export interface CargaCamion {
  patente: string;
  codigoRuta?: string;
  /** Cuándo se cerró el camión, en ISO. */
  en: string;
}

/** «14 PF», «14pf» y «14PF» son la misma tienda. */
export function claveTienda(cod: string): string {
  return String(cod ?? '').replace(/\s+/g, '').toUpperCase();
}

/**
 * Por tienda, el camión del último manifiesto que la nombra. `tipo` es 'seco' o 'congelado': las
 * rutas del otro tipo no cuentan. Una ruta sin tipo se toma como seca (las primeras no lo traían).
 */
export function cargaPorTienda(rutas: readonly RutaCargada[], tipo: 'seco' | 'congelado' = 'seco'): Map<string, CargaCamion> {
  const out = new Map<string, CargaCamion>();
  const ordenadas = [...rutas].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  for (const r of ordenadas) {
    if ((r.tipo || 'seco') !== tipo) continue;
    const patente = String(r.patente ?? '').trim().toUpperCase();
    if (!patente) continue;
    for (const t of r.ruta_tiendas ?? []) {
      if (!t?.store_cod) continue;
      out.set(claveTienda(t.store_cod), {
        patente,
        ...(r.codigo_ruta ? { codigoRuta: r.codigo_ruta } : {}),
        en: r.created_at,
      });
    }
  }
  return out;
}

/** «Cargada en TDCV15». */
export function textoCamion(c: CargaCamion): string {
  return `Cargada en ${c.patente}`;
}

/** Cuántas de las tiendas dadas ya van en un camión. */
export function cuantasCargadas(cods: readonly string[], carga: ReadonlyMap<string, CargaCamion>): number {
  return cods.filter(c => carga.has(claveTienda(c))).length;
}
