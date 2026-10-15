// ¿Esta unidad es de CONGELADOS? PURO.
//
// ── EL CASO DEL 14/10/2026 ────────────────────────────────────────────────────────────────────
//
// Reportaron que en Bodega se marcaba una tienda como terminada y «se volvía a salir sucia».
// 17MAI tenía cinco unidades ese día:
//
//     11:59  CC  congelados   sin peso, sin número      ← estas dos
//     11:59  CC  congelados   sin peso, sin número      ← la ensuciaban
//     12:16  P2  436 kg
//     12:16  P3  370,5 kg
//     14:51  P4  131 kg
//
// Isaías la marcó terminada a las 17:15 y seguía saliendo sucia: los dos congelados nunca iban a
// pesarse ahí, porque se pesan en la pestaña de Congelados.
//
// La consulta de slots de los dos espejos de seco pide TODO lo de la fecha —`date` + `is_active`,
// sin más— así que desde que Picking empezó a crear estas cajas, aparecieron en la pantalla
// equivocada. Medido: cero antes del 08/10/2026, y 28 unidades en 21 tiendas el 14/10.
//
// ── POR QUÉ SE MIRAN LAS TRES SEÑALES ─────────────────────────────────────────────────────────
//
// `section` es la señal buena, pero es nueva: en las filas anteriores al 08/10 viene vacía. `tipo`
// CC y CN son las dos cajas de congelados (ver `congeladosData.ts`), y `contenido` lo repite. Se
// miran las tres porque cualquiera alcanza para no mandar una caja a la pantalla equivocada, y
// ninguna unidad de seco cae por error en ellas: un pallet de seco no es CC ni CN, y su `section`
// es `comida`, `hogar`, `aseo` o `chocolates`.

/** Los dos tipos de caja de congelados. Ver `congelados/utils/congeladosData.ts`. */
export const TIPOS_CONGELADOS = ['CC', 'CN'] as const;

/** Lo mínimo que hace falta mirar de un slot. */
export interface UnidadParaClasificar {
  tipo?: string | null;
  section?: string | null;
  contenido?: string | null;
}

/** `true` si la unidad pertenece a Congelados y NO va en la pantalla de seco. */
export function esDeCongelados(u: UnidadParaClasificar | null | undefined): boolean {
  const tipo = String(u?.tipo ?? '').trim().toUpperCase();
  if ((TIPOS_CONGELADOS as readonly string[]).includes(tipo)) return true;
  const seccion = String(u?.section ?? '').trim().toLowerCase();
  if (seccion === 'congelados') return true;
  return String(u?.contenido ?? '').trim().toLowerCase() === 'congelados';
}

/** Las unidades que SÍ van en la pantalla de seco. */
export function soloSeco<T extends UnidadParaClasificar>(unidades: readonly T[]): T[] {
  return unidades.filter(u => !esDeCongelados(u));
}
