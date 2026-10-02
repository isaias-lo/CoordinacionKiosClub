/* ── Código de tipo para picking_pallets ──────────────────────────────────────
   Mapea el tipo/paquete de un item a la letra que espera picking_pallets
   (create-bodega): P (pallet), B (bulto/box), C (contenedor), CH (chocolate),
   A (adquisición), W (web/retiro).
   Puro — centraliza el mapeo antes duplicado en StepForm (Santiago) y TiendasPage (Nacional).

   ⚠ EL `default` DE ESTAS DOS FUNCIONES ES 'P', Y ESO MUERDE.

   Cuando nacieron la adquisición y el web/retiro nadie las agregó acá, así que caían al default y
   se guardaban como PALLET. En Nacional pasaba siempre; en RM/Costa a veces sí y a veces no,
   porque StepForm se había hecho DOS mapas propios en línea —con A y W— y seguía llamando a
   `tipoCodeSantiago` —sin A ni W— en otros tres sitios. El mismo envase salía 'A' o 'P' según por
   dónde pasara.

   El encabezado de este archivo decía "centraliza el mapeo antes duplicado", y la duplicación
   había vuelto. Ahora los mapas en línea se borraron y esta es otra vez la única fuente.

   Al agregar un envase nuevo: agregarlo ACÁ. El default se lo traga en silencio. */

import { esAdquisicion, esWebRetiro } from './adquisicion';
import type { ClaseEnvase } from './numeroCard';

export type TipoCodePicking = 'P' | 'B' | 'C' | 'CH' | 'A' | 'W';

/**
 * El camino de VUELTA: la letra guardada en `picking_pallets` → la clase de envase.
 *
 * Hace falta para poder preguntarle a una fila de la base cuánto puede pesar como máximo
 * (`TOPE_DURO_KG`), que es lo que impide que un peso imposible leído de la balanza llegue a la
 * planilla. Vive acá y no en el consumidor por la regla del encabezado: este archivo es la ÚNICA
 * fuente del mapeo, y tener la mitad de la vuelta en otro lado es cómo volvió la duplicación.
 *
 * El default es 'pallet' porque es el tope más ALTO (1.000 kg): un código desconocido no debe
 * hacer que algo se descarte por un techo que no le corresponde. Acá el default que muerde sería
 * el restrictivo, al revés que en las dos funciones de arriba.
 */
export function claseDeTipoCode(code?: string | null): ClaseEnvase {
  switch (String(code ?? '').trim().toUpperCase()) {
    case 'B':  return 'bulto';
    case 'C':  return 'contenedor';
    case 'CH': return 'chocolate';
    case 'A':  return 'adquisicion';
    case 'W':  return 'webretiro';
    case 'P':  return 'pallet';
    default:   return 'pallet';
  }
}

/** Santiago: 'Pallet' | 'Bulto' | 'Contenedor' | 'Chocolate' | 'Adquisicion' | 'WebRetiro'. */
export function tipoCodeSantiago(tipo: string): TipoCodePicking {
  if (esAdquisicion(tipo)) return 'A';
  if (esWebRetiro(tipo))   return 'W';
  switch (tipo) {
    case 'Contenedor': return 'C';
    case 'Chocolate':  return 'CH';
    case 'Bulto':      return 'B';
    default:           return 'P'; // Pallet
  }
}

/** Nacional: pkg 'pallet' | 'box' | 'contenedor' | 'chocolate' | 'adquisicion' | 'web-retiro'. */
export function pkgCodeNacional(pkg: string): TipoCodePicking {
  if (esAdquisicion(pkg)) return 'A';
  if (esWebRetiro(pkg))   return 'W';
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
    case 'A':  return '+ Adquisición';
    case 'W':  return '+ Web / retiro';
    case 'CC': return '+ Caja cartón';
    case 'CN': return '+ Caja negra';
    default:   return null;
  }
}
