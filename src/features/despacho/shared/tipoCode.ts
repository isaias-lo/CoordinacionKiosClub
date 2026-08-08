/* ── Código de tipo para picking_pallets ──────────────────────────────────────
   Mapea el tipo/paquete de un item a la letra que espera picking_pallets
   (create-bodega): P (pallet), B (bulto/box), C (contenedor), CH (chocolate).
   Puro — centraliza el mapeo antes duplicado en StepForm (Santiago) y TiendasPage (Nacional). */

export type TipoCodePicking = 'P' | 'B' | 'C' | 'CH';

/** Santiago: 'Pallet' | 'Bulto' | 'Contenedor' | 'Chocolate' → P/B/C/CH. */
export function tipoCodeSantiago(tipo: string): TipoCodePicking {
  switch (tipo) {
    case 'Contenedor': return 'C';
    case 'Chocolate':  return 'CH';
    case 'Bulto':      return 'B';
    default:           return 'P'; // Pallet
  }
}

/** Nacional: pkg 'pallet' | 'box' | 'contenedor' | 'chocolate' → P/B/C/CH. */
export function pkgCodeNacional(pkg: string): TipoCodePicking {
  switch (pkg) {
    case 'contenedor': return 'C';
    case 'chocolate':  return 'CH';
    case 'box':        return 'B';
    default:           return 'P'; // pallet
  }
}
