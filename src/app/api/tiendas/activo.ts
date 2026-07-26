// Representación canónica del campo ACTIVO en el Sheet TIENDAS ⇄ BD.
//
// Bug que corrige: el export escribía 'TRUE'/'FALSE', pero el import solo trataba
// 'NO' como inactivo → un round-trip Sheet→DB reactivaba las inactivas
// ('FALSE' !== 'NO' ⇒ true). Estas dos funciones son INVERSAS y toleran ambos
// formatos (TRUE/FALSE y SI/NO), por lo que el round-trip es idempotente.
// Puras (sin dependencias) para testear.

/** Interpreta la celda ACTIVO. Inactivo solo si es NO/FALSE/0; vacío o ausente ⇒ activo. */
export function parseActivo(cell: unknown): boolean {
  const v = String(cell ?? '').trim().toUpperCase();
  return !(v === 'NO' || v === 'FALSE' || v === '0');
}

/** Serializa a la celda ACTIVO. Canónico: 'SI' / 'NO'. */
export function serializeActivo(activo: boolean): string {
  return activo === false ? 'NO' : 'SI';
}
