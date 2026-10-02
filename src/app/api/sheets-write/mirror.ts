// Qué campos se pueden escribir en despacho_rm / despacho_regiones. Puro y testeable.
//
// Existe por un bug que estuvo vivo meses sin que nadie lo viera: los cinco puntos donde
// /api/sheets-write espeja la planilla a Supabase agregaban un campo `fuente` ('bodega_rm',
// 'bodega_regiones', 'enrutador', 'bodega_congelados') que esas dos tablas NO tienen. La columna
// existe en `despacho_sesion`, no acá.
//
// Postgres rechaza el INSERT entero cuando nombras una columna que no existe — no ignora el campo
// de más. Y los cinco sitios hacían `if (error) console.error(...)` y seguían. Resultado: la hoja
// se escribía, la base no, y nadie se enteraba. Las filas igual aparecían más tarde porque
// /api/sync-despacho vuelve a leer la planilla y las mete — por eso el síntoma no era "faltan
// datos" sino "los datos llegan tarde y solo si alguien sincroniza". Es la mitad de por qué el
// registro del día quedaba incompleto.
//
// La lista de abajo son las columnas REALES de las dos tablas (idénticas entre sí, verificadas
// contra information_schema). Filtrar contra ella evita que un campo nuevo en el código tumbe la
// escritura entera: el campo se descarta y se avisa, en vez de perderse la fila.
//
// `fuente` YA existe (migración add_fuente_a_despacho_rm_regiones): es la que faltaba. Sirve para
// saber quién escribió cada fila, que es justo el dato que no había al investigar el 11/09. NULL
// significa que la fila llegó por /api/sync-despacho releyendo la planilla, no por escritura
// directa — una distinción útil por sí sola.

/** Columnas reales de despacho_rm y despacho_regiones (el mismo conjunto en las dos). */
export const COLUMNAS_DESPACHO: ReadonlySet<string> = new Set([
  'alto', 'ancho', 'auditado', 'auditado_at', 'auditado_canonical_id', 'canonical_id',
  'carga', 'cod', 'comuna', 'conductor', 'conductor_modificado', 'conductor_original',
  'created_at', 'estado', 'fecha', 'fecha_armado', 'fecha_llegada', 'fuente', 'guia', 'id', 'largo',
  'modificado_at', 'n_pallet_bulto', 'patente', 'peso_kg', 'peso_v', 'picking_slot_id',
  'pioneta_1', 'pioneta_2', 'regimen', 'region', 'ruta', 'seguimiento', 'supervisor',
  'tienda', 'tipo', 'tipo_comuna', 'transporte', 'valor', 'ventana', 'vuelta',
]);

/** El registro sin los campos que la tabla no tiene. */
export function paraMirror<T extends Record<string, unknown>>(rec: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(rec)) if (COLUMNAS_DESPACHO.has(k)) out[k] = rec[k];
  return out;
}

/** Los campos que `paraMirror` descartaría. Para poder avisar en vez de perderlos en silencio. */
export function camposDescartados(rec: Record<string, unknown>): string[] {
  return Object.keys(rec).filter(k => !COLUMNAS_DESPACHO.has(k));
}

/**
 * Los ids que vienen más de una vez en el lote, con cuántas veces.
 *
 * ── POR QUÉ ESTO NO PUEDE PASAR CALLADO ────────────────────────────────────────────────────────
 *
 * El id de una fila es `${orden}${cod}${stamp}${prefijo}`, y el `orden` lo fija el navegador al
 * guardar, con las hermanas visibles EN ESE INSTANTE. Dos altas que no se ven entre sí toman el
 * mismo número — pasó el 02/10/2026 con las dos adquisiciones de 26ALC, las dos con `orden: "A1"`.
 *
 * Y los dos destinos reaccionan distinto, que es lo que lo hace difícil de ver:
 *
 *   · la HOJA se filtra contra los ids que YA tiene (`!sheetIdSet.has(...)`), no dentro del lote,
 *     así que agrega LAS DOS filas con el id repetido;
 *   · el ESPEJO a la base tiene el id como clave primaria, así que se queda con UNA.
 *
 * O sea: la hoja confunde y la base pierde. `desempatarOrden*` lo resuelve en el cliente, que es
 * donde se puede hacer bien porque ahí se ve la tienda completa. Esto es la red para cualquier
 * otra vía que escriba acá —el Enrutador, un script, lo que venga— y para el día que el desempate
 * del cliente no haya corrido.
 *
 * No se descarta ni se arregla nada: se AVISA. Elegir cuál de las dos vale no es decisión de una
 * ruta de red; perder una en silencio sí es lo que no puede seguir pasando.
 */
export function idsRepetidos(rows: readonly (string | number)[][]): { id: string; veces: number }[] {
  const veces = new Map<string, number>();
  for (const r of rows ?? []) {
    const id = String(r?.[0] ?? '').trim();
    if (!id) continue;
    veces.set(id, (veces.get(id) ?? 0) + 1);
  }
  return [...veces.entries()]
    .filter(([, n]) => n > 1)
    .map(([id, n]) => ({ id, veces: n }))
    .sort((a, b) => b.veces - a.veces || a.id.localeCompare(b.id));
}
