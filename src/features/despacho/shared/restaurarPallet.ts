// Restaurar un pallet borrado DESPUÉS de los 7 s del snackbar "Revertir". Puro y testeable.
//
// El borrado en picking_pallets es físico: la fila desaparece. Hasta ahora el único rastro era el
// evento 'eliminar' de picking_eventos, que guarda tipo, tienda, encargado, quién y cuándo — pero no
// el peso, las medidas, el número, la sección ni las guías. Con eso no se puede devolver un pallet
// tal como estaba, solo avisar que existió.
//
// Desde sql/2026-09-11_restaurar_pallet_borrado.sql el trigger de auditoría guarda además la fila
// completa (`datos = to_jsonb(OLD)`). Este módulo decide qué se reinserta y cómo se explica.

/**
 * Las columnas que vuelven, tal cual estaban. `picking_pallets.id` es un serial común, así que se
 * reinserta con su MISMO id: el pallet recupera su #número, su código de barras y su historial.
 *
 * Quedan afuera a propósito:
 * - `client_op_id`: el token de idempotencia de la cola offline es de la creación original.
 * - `date`, `is_active`, `combined_into`, `combined_at`: se fijan al restaurar (ver abajo).
 */
const COLUMNAS: readonly string[] = [
  'id', 'store_cod', 'state_key', 'picker_label', 'tipo', 'created_at', 'contenido', 'refs',
  'seq', 'canonical_id', 'peso_kg', 'alto', 'largo', 'ancho', 'peso_v',
  'estado', 'conductor', 'patente', 'ruta', 'supervisor', 'section',
];

type Copia = Record<string, unknown> | null | undefined;

/**
 * La fila a reinsertar, o `null` si la copia no alcanza para reconstruirla.
 *
 * Entra a la carga de HOY, activa y SUELTA — lo mismo que hace reclamar un preexistente. Si se
 * había sumado a un pallet, vuelve sin `combined_into`: no queda "absorbida" por un pallet que ya no
 * la tiene. Una columna que ya no existe en la tabla se ignora, porque la copia puede ser vieja.
 */
export function filaParaRestaurar(copia: Copia, hoy: string): Record<string, unknown> | null {
  if (!copia) return null;
  if (typeof copia.id !== 'number' || !String(copia.store_cod ?? '').trim() || !String(copia.tipo ?? '').trim()) {
    return null;
  }
  const fila: Record<string, unknown> = {};
  for (const c of COLUMNAS) if (c in copia) fila[c] = copia[c];
  return { ...fila, date: hoy, is_active: true, combined_into: null, combined_at: null };
}

export type ResultadoRestaurable = { ok: true } | { ok: false; motivo: 'sin_copia' | 'otra_tienda' };

/**
 * ¿Se puede restaurar acá? Un borrado anterior a que el trigger guardara copias no tiene qué
 * devolver; y un pallet de otra tienda no se restaura en esta.
 */
export function puedeRestaurar(copia: Copia, storeCod: string): ResultadoRestaurable {
  if (!copia) return { ok: false, motivo: 'sin_copia' };
  const norm = (s: unknown) => String(s ?? '').trim().toUpperCase();
  if (norm(copia.store_cod) !== norm(storeCod)) return { ok: false, motivo: 'otra_tienda' };
  return { ok: true };
}

const NOMBRE: Record<string, string> = {
  P: 'pallet', C: 'contenedor', B: 'bulto', CH: 'chocolate', CC: 'caja cartón', CN: 'caja negra',
};

/**
 * Lo que se le explica a la persona antes de confirmar.
 *
 * Incluye el aviso de la suma a propósito: sumar un bulto le pasa su peso al pallet y borra el
 * bulto. Restaurar el bulto NO le quita ese peso al pallet — el sistema no guarda a cuál se sumó,
 * así que no puede corregirlo solo. Mejor decirlo que dejar un pallet con el peso duplicado.
 */
export function avisoRestaurar(copia: Record<string, unknown>): string {
  const tipo = String(copia.tipo ?? '').trim().toUpperCase();
  const seq = typeof copia.seq === 'number' && copia.seq > 0 ? copia.seq : null;
  const quien = seq ? `el ${tipo}${seq}` : `el ${NOMBRE[tipo] ?? 'pallet'}`;
  const peso = typeof copia.peso_kg === 'number' && copia.peso_kg > 0
    ? ` (${String(copia.peso_kg).replace('.', ',')} kg)` : '';
  return `Vuelve ${quien}${peso} tal como estaba al borrarse, con su mismo número y etiqueta. `
    + 'Si se había sumado a un pallet, ese pallet todavía tiene su peso: revísalo.';
}
