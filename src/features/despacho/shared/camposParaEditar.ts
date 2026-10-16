// Lo que muestra el formulario al tocar «Editar» en una tarjeta guardada. Puro.
//
// ── POR QUÉ (06MQH, 14/10/2026) ────────────────────────────────────────────────────────────────
//
// El P2 de 06MQH se guardó «sin pesar» a las 15:39. A las 15:51 se editó y el guardado quedó con
// 237 kg / 180 cm, que eran los números del P1. Dos cosas lo permitían, en los dos espejos:
//
//   1. «Editar» reabría la fila pero no la elegía: el cuadro «Ahora» seguía mostrando la tarjeta
//      que estaba antes (la del último escaneo o toque). Eso se arregla donde está `editSavedRow`.
//   2. Los campos del formulario eran los que se escribieron al guardar EN ESTE equipo.
//      `reconcileSavedRows` refresca el ítem guardado de la fila cuando cambia en otro equipo, pero
//      no sus campos, así que «Editar» abría con números viejos, o con los de otro ítem cuando la
//      reconstrucción había atado la fila a otra unidad.
//
// Esto resuelve lo segundo: los campos salen del ítem que la tarjeta muestra, no de lo que quedó
// escrito en la fila.

import { esSinPesar } from './sinPesar';
import { pesoEnTarjeta, taraEnTarjeta } from './pesoDelPallet';
import { pesoParaMostrar, type SubtipoCaja } from './subtipoCaja';

export interface ItemAEditar {
  peso?: number | null;
  alto?: number | null;
  ancho?: number | null;
  largo?: number | null;
  taraPallet?: number | null;
  tipo?: string | null;
  pkg?: string | null;
  palletWeb?: boolean | null;
}

export interface CamposMedidas {
  peso: string;
  pesoPallet: string;
  alto: string;
  ancho: string;
  largo: string;
}

/**
 * Los campos de medidas para editar `item`.
 *
 * - `caja`: el subtipo de la caja si es un chocolate. La caja guarda el NETO y el formulario
 *   muestra el BRUTO (lo que marca la balanza), igual que al rearmar la tarjeta.
 * - Un ítem «sin pesar» abre con peso y alto en blanco: sus 0 no son medidas, son «falta pesar».
 *   Ancho y largo quedan como estaban en la fila (los del pallet son fijos).
 */
export function camposParaEditar(
  item: ItemAEditar,
  caja: SubtipoCaja | null,
  fila: { ancho: string; largo: string },
): CamposMedidas {
  if (esSinPesar(item)) return { peso: '', pesoPallet: '', alto: '', ancho: fila.ancho, largo: fila.largo };
  return {
    peso: caja ? String(pesoParaMostrar(Number(item.peso ?? 0), caja)) : pesoEnTarjeta(item.peso, item.taraPallet),
    pesoPallet: taraEnTarjeta(item.taraPallet),
    alto:  item.alto  != null ? String(item.alto)  : '',
    ancho: item.ancho != null ? String(item.ancho) : fila.ancho,
    largo: item.largo != null ? String(item.largo) : fila.largo,
  };
}
