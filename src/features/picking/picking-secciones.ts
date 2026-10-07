import type { SectionFilter, PickingOperation, PalletSlot } from './picking-types';

/**
 * Sección de Picking a la que pertenece algo. Son las secciones "reales" (todas menos 'all').
 * Una operación o pallet cae en UNA sección, o en ninguna cuando es ambiguo/mixto (tiene Hogar
 * Y Aseo/Comida a la vez) o irreconocible → `null`.
 */
export type Seccion = Exclude<SectionFilter, 'all'>;

const SECCIONES: readonly Seccion[] = ['comida', 'aseo', 'hogar', 'chocolates', 'congelados'];

/** Normaliza un string suelto (p.ej. `slot.section` de la BD) a una `Seccion` válida o `null`. */
export function normalizarSeccion(raw: string | null | undefined): Seccion | null {
  return raw != null && (SECCIONES as readonly string[]).includes(raw) ? (raw as Seccion) : null;
}

/**
 * Sección derivada del CONTENIDO de un pallet (token tipo 'aseo' / 'hogar' / 'mixto' / 'chocolate'…).
 * Fallback para pallets viejos que aún no tienen la columna `section`. Robusto por substring
 * (mismo criterio difuso que `categoriesToContenido`). `null` = mixto/ambiguo → solo cuenta en "Todas".
 *
 * Prioridad: congelados/chocolate primero (coincide con cómo `categoriesToContenido` escribió el
 * contenido histórico), luego mixto (Hogar + Aseo/Comida) → null, luego Aseo/Comida, luego Hogar.
 */
export function seccionDeContenido(contenido: string | null | undefined): Seccion | null {
  const c = (contenido ?? '').toLowerCase();
  if (c.includes('congelado')) return 'congelados';
  if (c.includes('chocolate')) return 'chocolates';
  const hogar  = c.includes('hogar') || c.includes('bazar') || c.includes('home');
  const comida = c.includes('comida') || c.includes('aliment') || c.includes('food');
  const aseo   = c.includes('aseo') || c.includes('limpieza') || c.includes('clean');
  // UNA sección o ninguna. Desde que Comida y Aseo son dos, «comida-aseo» también es mixto —
  // antes caía en la sección común y ahora no hay una sola a la que pertenezca.
  const cuantas = [comida, aseo, hogar].filter(Boolean).length;
  if (cuantas !== 1) return null;
  return comida ? 'comida' : aseo ? 'aseo' : 'hogar';
}

/**
 * Sección de un GRUPO (picker) a partir de las categorías de sus operaciones. Espeja exactamente
 * la lógica de `getSection` de la vista "Todas": si mezcla Hogar con Aseo/Comida es mixto → `null`.
 * (Se usa para etiquetar un pallet nuevo creado en la vista "Todas", donde no hay filtro activo.)
 */
export function seccionDeGrupo(categories: string[]): Seccion | null {
  const cats = new Set(categories);
  const comida = cats.has('Comida');
  const aseo   = cats.has('Aseo');
  const hogar  = cats.has('Hogar');
  // Mezclar DOS de las tres es mixto, igual que antes lo era Hogar + Aseo/Comida.
  if ([comida, aseo, hogar].filter(Boolean).length > 1) return null;
  if (cats.has('Chocolates')) return 'chocolates';
  if (cats.has('Congelados')) return 'congelados';
  if (comida) return 'comida';
  if (aseo) return 'aseo';
  if (hogar) return 'hogar';
  return null;
}

/** ¿Una operación (por sus categorías) pertenece a la sección dada? Test de inclusión por-op. */
export function opEnSeccion(categories: string[], section: Seccion): boolean {
  const cats = new Set(categories);
  if (section === 'comida') return cats.has('Comida');
  if (section === 'aseo') return cats.has('Aseo');
  if (section === 'hogar') return cats.has('Hogar');
  if (section === 'chocolates') return cats.has('Chocolates');
  return cats.has('Congelados');
}

/** Recorta las operaciones a las de una sección. Con 'all' devuelve todas (sin copiar). */
export function filtrarOpsPorSeccion(ops: PickingOperation[], section: SectionFilter): PickingOperation[] {
  return section === 'all' ? ops : ops.filter(o => opEnSeccion(o.categories, section));
}

/**
 * Sección efectiva de un pallet para CONTAR por sección: usa la columna `section` explícita si
 * existe; si no (pallets viejos), cae al contenido. Así los conteos por sección son independientes
 * y en "Todas" se suma todo. Los mixtos sin clasificar (`null`) solo suman en "Todas".
 */
export function seccionDeSlot(slot: Pick<PalletSlot, 'section' | 'contenido'>): Seccion | null {
  // Un `section` que ya no es válido —'aseo-comida', de antes de separar Comida y Aseo— cae al
  // contenido por el mismo camino que un pallet viejo sin columna. No hay rama especial: la
  // resolución del legado y el respaldo de los viejos son la misma pregunta.
  //
  // Medido sobre los 286 guardados así: 158 dicen «comida» y 53 «aseo», o sea que 211 se resuelven
  // solos. Los 75 restantes —«completo», «aseo-hogar», «comida-aseo»— eran ambiguos de entrada y
  // quedan en «Todas», que es donde corresponde a lo que no pertenece a una sola sección.
  return normalizarSeccion(slot.section) ?? seccionDeContenido(slot.contenido);
}

// Mismo vocabulario que usan las categorías reales de Odoo (ABAST_KEYWORDS en picking-utils.ts:
// 'Comida' | 'Aseo' | 'Hogar' | 'Chocolates' | 'Congelados') — para que una etiqueta de un
// encargado manual se vea igual que una de Odoo, no un formato distinto.
const SECCION_A_CATEGORIAS: Record<Seccion, string[]> = {
  comida: ['Comida'],
  aseo: ['Aseo'],
  hogar: ['Hogar'],
  chocolates: ['Chocolates'],
  congelados: ['Congelados'],
};

/**
 * TODAS las categorías que nombra el `contenido` de un pallet, no solo una. PURA.
 *
 * `seccionDeContenido` contesta «¿a qué sección pertenece?» y por eso devuelve `null` cuando el
 * pallet nombra dos —un mixto no pertenece a una sola—. Esta contesta otra pregunta: «¿qué LLEVA
 * adentro?», y ahí dos respuestas no son ambiguas, son dos. Mismo vocabulario difuso, para que no
 * se puedan separar.
 */
export function categoriasDeContenido(contenido: string | null | undefined): string[] {
  const c = (contenido ?? '').toLowerCase();
  const out: string[] = [];
  if (c.includes('comida') || c.includes('aliment') || c.includes('food'))  out.push('Comida');
  if (c.includes('aseo')   || c.includes('limpieza') || c.includes('clean')) out.push('Aseo');
  if (c.includes('hogar')  || c.includes('bazar')   || c.includes('home'))  out.push('Hogar');
  if (c.includes('chocolate'))  out.push('Chocolates');
  if (c.includes('congelado'))  out.push('Congelados');
  return out;
}

/**
 * Categorías "sintéticas" para un grupo SIN operaciones de Odoo (modo manual): un encargado
 * manual no tiene `op.categories` de dónde sacarlas (allCategories salía siempre vacío), así
 * que se derivan de la sección real de sus pallets (la que se eligió al crearlo). Sin esto, la
 * etiqueta impresa de un encargado manual nunca mostraba el tipo de carga.
 */
export function categoriasDeSlotsManual(slots: Pick<PalletSlot, 'section' | 'contenido'>[]): string[] {
  const labels = new Set<string>();
  for (const s of slots) {
    const sec = seccionDeSlot(s);
    // Con sección, manda la sección: es la que se eligió al crear el pallet.
    if (sec) { SECCION_A_CATEGORIAS[sec].forEach(l => labels.add(l)); continue; }
    // Sin sección es un MIXTO, y entonces la etiqueta salía en blanco: un mixto no pertenece a
    // una sola sección, así que no había de dónde sacar la franja. Pero el `contenido` ya dice lo
    // que lleva («comida-aseo»), y eso no es ambiguo: son dos. Ver `categoriasDeContenido`.
    categoriasDeContenido(s.contenido).forEach(l => labels.add(l));
  }
  return [...labels];
}

// ── LA ETIQUETA DESCRIBE UN PALLET, NO UNA PESTAÑA ────────────────────────────────────────────
//
// 07/10/2026, tienda 41ANA: Cristian Morales hizo DOS operaciones de Odoo en el mismo batch
// —una de Aseo y una de Hogar— y armó UN solo pallet, el slot #1533. La base lo guardó bien:
// `contenido = 'aseo-hogar'` y las dos referencias.
//
// Pero la etiqueta impresa desde la pestaña HOGAR decía solo «Hogar». Los chips salían de
// `group.operations`, que viene RECORTADO por el filtro de sección, mientras que el `contenido`
// que se escribe en la base ya usaba las operaciones del grupo completo (está comentado en
// `PickingScreen`). O sea: el mismo pallet imprimía distinto según en qué pestaña estuvieras.
//
// Una etiqueta describe lo que lleva el pallet. Eso no cambia porque alguien mire otra columna.

/** Lo mínimo de una operación de Odoo para saber qué lleva. */
export interface OperacionConCategorias { categories: string[] }

/**
 * Las categorías que se imprimen en la etiqueta de un grupo. PURA.
 *
 * `opsCompletas` son las del grupo SIN recortar por sección — las recortadas harían que la
 * etiqueta dependa de la pestaña. Sin operaciones (encargado manual) cae a los pallets, que es
 * de donde ya salían.
 */
export function categoriasDelGrupo(
  opsCompletas: readonly OperacionConCategorias[],
  slots: Pick<PalletSlot, 'section' | 'contenido'>[],
): string[] {
  if (opsCompletas.length === 0) return categoriasDeSlotsManual(slots);
  return [...new Set(opsCompletas.flatMap(o => o.categories))];
}
