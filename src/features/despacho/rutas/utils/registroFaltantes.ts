// Registro del enrutador: detectar tiendas ruteadas SIN fila previa en DESPACHO RM/REGIONES.
//
// El path del enrutador en /api/sheets-write es UPDATE-only por (fecha::cod): actualiza la
// fila que Bodega ya creó. Si una tienda se ruteó pero NO pasó por Bodega, no hay fila que
// actualizar y antes se descartaba en silencio (ej. 56PZA, una tienda placeholder). Esta
// lógica pura decide qué records hay que AGREGAR (append) para que no se pierda ninguna.

export interface FaltanteKeyed {
  fecha?: string | null;
  cod?: string | null;
}

/**
 * Índices de `records` cuya clave (fecha::cod) NO existe aún en `existingKeys` → hay que
 * agregarlas (append) en el registro del enrutador. Deduplica dentro del lote y descarta
 * records sin fecha o sin cod. Determinista (preserva el orden de entrada).
 */
export function pickFaltantesIdx(records: FaltanteKeyed[], existingKeys: Set<string>): number[] {
  const out: number[] = [];
  const seen = new Set<string>();
  records.forEach((r, i) => {
    if (!r.fecha || !r.cod) return;
    const key = `${r.fecha}::${r.cod}`;
    if (existingKeys.has(key) || seen.has(key)) return;
    seen.add(key);
    out.push(i);
  });
  return out;
}

/**
 * id determinista para la fila agregada (col A de DESPACHO RM/REGIONES y PK en Supabase).
 * Estable por (fecha, cod) → al re-registrar, la fila ya existe (cae en el update) y no se
 * duplica. Formato: ENR-DDMMYYYY-COD.
 */
export function faltanteId(fecha: string, cod: string): string {
  return `ENR-${fecha.replace(/\//g, '')}-${cod}`;
}
