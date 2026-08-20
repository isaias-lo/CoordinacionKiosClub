import type { SectionFilter, PickingOperation, PalletSlot } from './picking-types';

/**
 * Sección de Picking a la que pertenece algo. Son las secciones "reales" (todas menos 'all').
 * Una operación o pallet cae en UNA sección, o en ninguna cuando es ambiguo/mixto (tiene Hogar
 * Y Aseo/Comida a la vez) o irreconocible → `null`.
 */
export type Seccion = Exclude<SectionFilter, 'all'>;

const SECCIONES: readonly Seccion[] = ['aseo-comida', 'hogar', 'chocolates', 'congelados'];

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
  const hasHogar = c.includes('hogar') || c.includes('bazar') || c.includes('home');
  const hasAC =
    c.includes('comida') || c.includes('aliment') || c.includes('food') ||
    c.includes('aseo') || c.includes('limpieza') || c.includes('clean');
  if (hasHogar && hasAC) return null; // mixto
  if (hasAC) return 'aseo-comida';
  if (hasHogar) return 'hogar';
  return null;
}

/**
 * Sección de un GRUPO (picker) a partir de las categorías de sus operaciones. Espeja exactamente
 * la lógica de `getSection` de la vista "Todas": si mezcla Hogar con Aseo/Comida es mixto → `null`.
 * (Se usa para etiquetar un pallet nuevo creado en la vista "Todas", donde no hay filtro activo.)
 */
export function seccionDeGrupo(categories: string[]): Seccion | null {
  const cats = new Set(categories);
  const hasHogar = cats.has('Hogar');
  const hasAC = cats.has('Aseo') || cats.has('Comida');
  if (hasHogar && hasAC) return null; // mixto
  if (cats.has('Chocolates')) return 'chocolates';
  if (cats.has('Congelados')) return 'congelados';
  if (hasAC) return 'aseo-comida';
  if (hasHogar) return 'hogar';
  return null;
}

/** ¿Una operación (por sus categorías) pertenece a la sección dada? Test de inclusión por-op. */
export function opEnSeccion(categories: string[], section: Seccion): boolean {
  const cats = new Set(categories);
  if (section === 'aseo-comida') return cats.has('Aseo') || cats.has('Comida');
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
  return normalizarSeccion(slot.section) ?? seccionDeContenido(slot.contenido);
}
