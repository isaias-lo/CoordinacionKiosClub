// CRUCE PESOS: lo que Odoo dice que se movió contra lo que Bodega pesó en el andén.
// Puro y testeable: no toca Odoo, ni la base, ni la planilla.
//
// Una fila por TIENDA y por DÍA, con los cuatro tipos de abastecimiento en columnas.
//
// DE DÓNDE SALE CADA COSA (verificado contra Odoo el 29/09/2026, no supuesto):
//
//   · El TIPO viene en el `origin` del movimiento: "Abastecimiento Comida 24SPP 29/09/2026".
//     No se deduce de lo que clasificó Bodega — lo declara Odoo.
//   · La TIENDA viene en el destino: "24SPP", a veces "24SPP/Entrada".
//   · El PESO es `total_weight`, la columna «Peso Total» de la pantalla de Traslados internos.
//
// TRES COSAS SUCIAS DE LOS DATOS REALES, medidas sobre 277 movimientos del 28 y 29/09. Cada una
// habría dado una tabla mal SIN AVISAR:
//
//   1. Hay orígenes con PUNTO FINAL: "Abastecimiento Congelados 56EGN 28/09/2026."
//   2. El destino llega como "16PQA" o como "16PQA/Entrada", según la tienda.
//   3. Hay movimientos que NO van a tienda: "Abastecimiento Meli Full 88ML/Stock". Y ojo, que
//      "88ML" TIENE FORMA de código de tienda: 2 dígitos y 2 letras. Validar con una expresión
//      regular lo habría dejado pasar como si fuera una tienda. Por eso la tienda se valida contra
//      el catálogo real, nunca contra un patrón.

/** Los cuatro tipos que se cruzan. Congelados queda fuera: se despacha otro día. */
export const TIPOS_CRUCE = ['comida', 'aseo', 'hogar', 'chocolate'] as const;
export type TipoCruce = typeof TIPOS_CRUCE[number];

/** Un movimiento de Odoo, con lo justo. */
export interface MovimientoOdoo {
  /** `stock.picking.name` — 99REC/DT/131559. */
  ref: string;
  /** `origin` — "Abastecimiento Comida 24SPP 29/09/2026". */
  origen: string;
  /** El nombre del destino — "24SPP" o "24SPP/Entrada". */
  destino: string;
  /** `total_weight`, en kg. */
  kg: number;
}

/**
 * El tipo que DECLARA el origen, o `null` si no es uno de los cuatro.
 *
 * Devuelve `null` —y no un tipo por defecto— para congelados, para los "Meli Full" y para
 * cualquier texto nuevo que aparezca mañana. Meter lo desconocido en una de las cuatro columnas
 * inflaría un total sin que nadie pueda notarlo después.
 */
export function tipoDeOrigen(origen?: string | null): TipoCruce | null {
  const texto = String(origen ?? '');
  // AUDITORIA queda fuera, y esto NO es una precaución teórica: el 28/09, 47 grupos
  // (tipo + tienda) tenían un movimiento normal Y uno de auditoría con EL MISMO PESO —
  // 130936 y 131044, los dos 107,88 kg. Ninguno existía solo como auditoría. Son la misma
  // mercadería revalidada, y contarlos sumaba 8.766 kg fantasma en un día: un 42% de más.
  //
  // El endpoint de Odoo ya los excluye. Esto lo repite acá a propósito: la regla que hace o
  // deshace el número no puede depender de que el llamador se acuerde de filtrar.
  if (/auditoria/i.test(texto)) return null;
  const m = /abastecimiento\s+(comida|aseo|hogar|chocolates?)\b/i.exec(texto);
  if (!m) return null;
  return m[1].toLowerCase().replace(/s$/, '') as TipoCruce;
}

/**
 * El código de tienda del destino, o `null`.
 *
 * `codigosValidos` es el catálogo real. NO se valida con una expresión regular a propósito: el
 * destino "88ML/Stock" (MercadoLibre) pasa cualquier patrón de código de tienda.
 */
export function tiendaDeDestino(
  destino: string | null | undefined, codigosValidos: Set<string>,
): string | null {
  const cod = String(destino ?? '').split('/')[0].trim().toUpperCase();
  return cod && codigosValidos.has(cod) ? cod : null;
}

/** Una fila de la hoja: una tienda, un día. */
export interface FilaCruce {
  codigo: string;
  /** Referencias por tipo, en el orden en que llegaron. */
  refs: Record<TipoCruce, string[]>;
  /** Kilos de Odoo por tipo. */
  kg: Record<TipoCruce, number>;
  /** Suma de los cuatro tipos. */
  totalOdoo: number;
}

const ceros = (): Record<TipoCruce, number> => ({ comida: 0, aseo: 0, hogar: 0, chocolate: 0 });
const vacios = (): Record<TipoCruce, string[]> => ({ comida: [], aseo: [], hogar: [], chocolate: [] });

/**
 * Arma las filas por tienda a partir de los movimientos del día.
 *
 * **Cada movimiento se suma UNA SOLA VEZ**, aunque venga repetido. Es la trampa que habría
 * arruinado la tabla en silencio: el 29/09, la tienda 31TLC tenía cuatro chocolates apuntando al
 * mismo movimiento. Sumando por unidad daba 339,44 kg en vez de 84,86 — cuatro veces el peso real,
 * con un número que se ve perfectamente plausible.
 *
 * Las tiendas salen ordenadas por código, que es como se leen en la planilla.
 */
export function armarCruce(
  movimientos: MovimientoOdoo[], codigosValidos: Set<string>,
): FilaCruce[] {
  const porTienda = new Map<string, FilaCruce>();
  const yaContados = new Set<string>();

  for (const m of movimientos) {
    const tipo = tipoDeOrigen(m.origen);
    const cod = tiendaDeDestino(m.destino, codigosValidos);
    if (!tipo || !cod) continue;

    const ref = String(m.ref ?? '').trim();
    // La llave incluye la tienda: el mismo movimiento no puede sumar en dos tiendas, pero si
    // alguna vez llegara repetido dentro de la misma, se cuenta una vez.
    const llave = `${cod}|${ref}`;
    if (ref && yaContados.has(llave)) continue;
    if (ref) yaContados.add(llave);

    let fila = porTienda.get(cod);
    if (!fila) {
      fila = { codigo: cod, refs: vacios(), kg: ceros(), totalOdoo: 0 };
      porTienda.set(cod, fila);
    }
    if (ref) fila.refs[tipo].push(ref);
    const kg = Number(m.kg) || 0;
    fila.kg[tipo] += kg;
    fila.totalOdoo += kg;
  }

  return [...porTienda.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es'));
}

/**
 * El % de diferencia entre lo pesado en Bodega y lo que dice Odoo.
 *
 * Positivo = Bodega pesó de más. `null` cuando no hay con qué comparar: sin kilos de Odoo, un
 * "100%" o un "0%" serían igual de falsos, y la celda tiene que quedar vacía.
 */
export function pctDiferencia(kgBodega: number, kgOdoo: number): number | null {
  const odoo = Number(kgOdoo) || 0;
  if (odoo <= 0) return null;
  return ((Number(kgBodega) || 0) - odoo) / odoo * 100;
}

/**
 * La diferencia en KILOS: Bodega menos Odoo. Positivo = Bodega pesó de más.
 *
 * Va al lado del porcentaje porque responden cosas distintas y las dos hacen falta. Un −53,8% no
 * dice si faltan 400 kg o 4: en una tienda chica un porcentaje enorme puede ser nada, y en una
 * grande un 5% pueden ser cien kilos. El porcentaje ordena; los kilos dicen cuánto pesa el
 * problema.
 *
 * A diferencia del porcentaje, esto SÍ tiene sentido con Odoo en cero —significa que llegó carga
 * que Odoo no registra— así que solo se devuelve `null` cuando no hay peso de Bodega con qué
 * comparar.
 */
export function kgDiferencia(kgBodega: number, kgOdoo: number): number {
  return (Number(kgBodega) || 0) - (Number(kgOdoo) || 0);
}

/**
 * Las referencias como se escriben en la celda: COMPLETAS.
 *
 * Al principio les sacaba el prefijo —`131559` en vez de `99REC/DT/131559`— porque es igual en
 * todas y ocupa el doble. El coordinador pidió la referencia entera, y tiene razón: así se copia
 * de la celda y se pega en el buscador de Odoo sin tener que reconstruir nada.
 */
export function refsParaCelda(refs: string[]): string {
  return refs.map(r => String(r ?? '').trim()).filter(Boolean).join(', ');
}
