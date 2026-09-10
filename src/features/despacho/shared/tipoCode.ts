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

/**
 * El mapeo inverso: de la letra guardada al TEXTO EXACTO del botón que hay que apretar.
 *
 * Se usa para decirle a alguien "vuelve a crearlo con + Choc." cuando el pallet que busca fue
 * eliminado. Va el texto literal del botón —"+ Choc." y no "+ Chocolate"— porque el punto del
 * mensaje es que lo encuentre en pantalla sin traducir nada.
 *
 * Acepta CC y CN (cajas de congelados), que existen en `picking_eventos` aunque no estén en
 * `TipoCodePicking`. Un código desconocido devuelve null: mejor omitir la instrucción que mandar
 * a alguien a buscar un botón que no existe.
 */
export function botonDeTipoCode(code?: string | null): string | null {
  switch ((code ?? '').trim().toUpperCase()) {
    case 'P':  return '+ Pallet';
    case 'B':  return '+ Bulto';
    case 'C':  return '+ Cont.';
    case 'CH': return '+ Choc.';
    case 'CC': return '+ Caja cartón';
    case 'CN': return '+ Caja negra';
    default:   return null;
  }
}
