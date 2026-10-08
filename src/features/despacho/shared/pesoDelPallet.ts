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
// El ítem guarda el NETO y, aparte, cuánto pesó el pallet (`taraPallet`). La tarjeta muestra lo que
// se tecleó: al rearmarla desde el ítem vuelve como bruto (neto + tara) con la tara en su casillero,
// así que volver a guardar resta una sola vez y nadie tiene que acordarse de cuánto pesaba.

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

/** Lo que se guarda en el ítem: la tara, o nada si no hubo. */
export function taraParaGuardar(tara: number): number | undefined {
  return Number.isFinite(tara) && tara > 0 ? tara : undefined;
}

/** El Peso de la tarjeta rearmada desde el ítem: el bruto (neto + tara). `''` si no hay peso. */
export function pesoEnTarjeta(neto: number | string | null | undefined, tara?: number | null): string {
  if (neto == null || neto === '') return '';
  const n = Number(neto);
  if (!Number.isFinite(n)) return String(neto);
  return tara && tara > 0 ? String(redondear(n + tara)) : String(neto);
}

/** El casillero «Peso del pallet» de la tarjeta rearmada desde el ítem. */
export function taraEnTarjeta(tara?: number | null): string {
  return tara && tara > 0 ? String(tara) : '';
}

/** «278 kg (300 − 22)»: el neto, y de dónde sale si se restó el pallet. */
export function textoPesoConTara(neto: number, tara?: number | null): string {
  const base = `${coma(neto)} kg`;
  return tara && tara > 0 ? `${base} (${coma(redondear(neto + tara))} − ${coma(tara)})` : base;
}

interface TarjetaConPeso {
  peso: string;
  pesoPallet?: string;
  savedItem?: { peso: number; taraPallet?: number };
}

/**
 * El peso NETO de una tarjeta, guardada o no: lo que se suma o se une a otra.
 *
 * Sumar o unificar sobre un pallet SIN GUARDAR tomaba el Peso tecleado tal cual, que es el bruto, y
 * la tarjeta se reabría con el «Peso del pallet» vacío: P1 de 300 con tara 22 más un bulto de 20
 * quedaba en 320 (debía ser 298), y así se escribía en el slot.
 */
export function pesoNetoDeTarjeta(row: TarjetaConPeso): number {
  if (row.savedItem) return row.savedItem.peso;
  const neto = pesoNetoPallet(row.peso, row.pesoPallet);
  return neto.ok ? neto.neto : (leerPeso(row.peso) ?? 0);
}

/** La tara de la tarjeta: la guardada, o la que está escrita si todavía no se guardó. */
export function taraDeTarjeta(row: TarjetaConPeso): number | undefined {
  if (row.savedItem) return row.savedItem.taraPallet;
  return taraParaGuardar(leerTaraPallet(row.pesoPallet) ?? 0);
}
