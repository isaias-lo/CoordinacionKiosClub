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

/** Columnas reales de despacho_rm y despacho_regiones (el mismo conjunto en las dos). */
export const COLUMNAS_DESPACHO: ReadonlySet<string> = new Set([
  'alto', 'ancho', 'auditado', 'auditado_at', 'auditado_canonical_id', 'canonical_id',
  'carga', 'cod', 'comuna', 'conductor', 'conductor_modificado', 'conductor_original',
  'created_at', 'estado', 'fecha', 'fecha_armado', 'fecha_llegada', 'guia', 'id', 'largo',
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
