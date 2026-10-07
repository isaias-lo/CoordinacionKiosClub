// «Peso del pallet»: la tarima misma, que se resta del peso que marcó la balanza.
//
// Reemplaza a «Cajas negras pesadas con el pallet». Esa pregunta servía para un solo caso (cajas
// retornables encima) y obligaba a hacer la cuenta de 3,5 kg por caja de cabeza; ahora se escribe
// directamente cuánto pesa lo que NO es mercadería y se resta:
//
//     Peso 300  ·  Peso del pallet 22   →   se guardan 278
//
// Es opcional: vacío o 0 deja el peso tal cual, que era el caso normal antes también.
//
// La tarjeta guarda lo TECLEADO (bruto y tara) y el ítem guarda el neto. Editar con el ✎ conserva
// lo tecleado, así que volver a guardar resta una sola vez. Al reconstruir desde el ítem la tarjeta
// trae el neto y la tara vacía: tampoco resta dos veces.

import { leerPeso } from './pesoIngresado';

export type PesoNetoPallet =
  | { ok: true; neto: number; bruto: number; tara: number }
  | { ok: false; error: string };

const coma = (n: number) => String(n).replace('.', ',');
const redondear = (n: number) => Math.round(n * 10) / 10;

/** Lo escrito en «Peso del pallet», en kg. Vacío = 0. `null` si no se entiende o es negativo. */
export function leerTaraPallet(texto: unknown): number | null {
  const crudo = String(texto ?? '').trim();
  if (!crudo || /^0+([.,]0*)?$/.test(crudo)) return 0;
  return leerPeso(crudo);
}

/**
 * El peso que queda registrado para un pallet: lo que marcó la balanza menos el pallet.
 *
 * Se RECHAZA si el pallet pesa lo mismo o más que todo lo pesado: o un número está mal o el otro
 * lo está, y guardar la resta convierte un error visible en un dato falso.
 */
export function pesoNetoPallet(bruto: unknown, taraTexto: unknown): PesoNetoPallet {
  const b = leerPeso(bruto);
  if (b == null) return { ok: false, error: 'Escribe el peso que marcó la balanza (ej. 300).' };
  const tara = leerTaraPallet(taraTexto);
  if (tara == null) return { ok: false, error: 'El peso del pallet no se entiende: escribe solo los kilos (ej. 22).' };
  if (tara === 0) return { ok: true, neto: b, bruto: b, tara: 0 };
  if (tara >= b) {
    return {
      ok: false,
      error: `El pallet (${coma(tara)} kg) no puede pesar igual o más que todo lo pesado (${coma(b)} kg). Revisa los dos números.`,
    };
  }
  return { ok: true, neto: redondear(b - tara), bruto: b, tara };
}

/** «se guardan 278 kg», bajo los campos, mientras se escribe. `null` si todavía no hay nada que decir. */
export function avisoNetoPallet(bruto: unknown, taraTexto: unknown): string | null {
  const tara = leerTaraPallet(taraTexto);
  if (!tara) return null;
  const r = pesoNetoPallet(bruto, taraTexto);
  if (!r.ok) return leerPeso(bruto) == null ? `se restan ${coma(tara)} kg` : '⚠ el pallet pesa más que lo pesado';
  return `se guardan ${coma(r.neto)} kg`;
}
