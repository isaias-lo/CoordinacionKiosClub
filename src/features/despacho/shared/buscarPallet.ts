// Encontrar un pallet/bulto por lo que la persona tiene en la mano: el número impreso, o el código
// de barras de la etiqueta leído con la pistola. Entre TODAS las tiendas, no solo la abierta.
// Puro y testeable.
//
// Antes el buscador de Bodega solo filtraba tiendas por nombre o código: para llegar a un pallet
// puntual había que adivinar en qué tienda estaba, abrirla, y buscarlo a ojo entre las tarjetas.
//
// ── Las dos formas de la misma etiqueta ────────────────────────────────────────────────────────
//
// La etiqueta impresa lleva las dos cosas, y el código de barras carga UNA de ellas según lo que
// el slot tenga (`BarcodeCard.tsx`: `canonicalId || String(slotId)`):
//
//   · el `canonical_id`   `1B28TEM22092026B` — {seq}{tipo}{tienda}{ddmmyyyy}{tipo}
//   · o el número del slot `14449` — solo cuando todavía no tiene canonical
//
// Medido sobre una semana: el **71%** de los slots tiene `canonical_id`. O sea que aceptar solo
// dígitos —como hacía la primera versión— deja fuera siete de cada diez escaneos. Por eso este
// módulo resuelve las dos.
//
// ── La Ñ, que es la trampa ─────────────────────────────────────────────────────────────────────
//
// `sanitizeForBarcode` limpia los no-ASCII, pero NO se aplica al `canonical_id`: el valor viaja
// crudo al Code128, así que las etiquetas de 23PEÑ y 37VIÑ llevan una Ñ que ese simbolismo no
// codifica de forma confiable. Lo que devuelva la pistola puede no ser byte a byte lo guardado.
//
// Por eso la comparación normaliza LOS DOS LADOS: sin tildes ni Ñ, en mayúsculas, y sin nada que
// no sea A-Z0-9. Así `1B37VIÑ…` y `1B37VIN…` son la misma etiqueta. No es tolerancia difusa —
// sigue siendo igualdad exacta, solo que sobre una forma canónica de verdad.
//
// ── Por qué no hace falta un "modo escáner" ────────────────────────────────────────────────────
//
// Una pistola de radiofrecuencia se comporta como un teclado: escribe el contenido del código y
// manda Enter. Si el buscador entiende lo que teclea, escanear y tipear son el mismo camino, y no
// hay un modo aparte que alguien tenga que acordarse de encender.

export interface SlotDePallet {
  id: number;
  /** El código que va impreso en el barcode cuando existe. Ver `buildCanonicalId`. */
  canonical_id?: string | null;
}

export interface PalletEncontrado<Slot extends SlotDePallet> {
  /** Clave con la que el espejo indexa sus mapas por tienda — código en Santiago, nombre en
   *  Regiones. Este módulo no necesita saber cuál es. */
  claveTienda: string;
  slot: Slot;
  /** Cómo se lo encontró. Sirve para el texto que ve la persona y para diagnosticar. */
  via: 'numero' | 'codigo';
}

/**
 * Forma canónica para comparar: sin tildes ni Ñ, mayúsculas, solo A-Z0-9.
 *
 * Se aplica a los dos lados —lo escaneado y lo guardado— porque el problema no está en uno solo:
 * la Ñ puede deformarse al imprimir el código o al leerlo, y no se sabe de qué lado.
 */
function canon(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Busca el pallet que la persona indicó, sea tecleando su número o escaneando su etiqueta.
 *
 * Primero por número —es lo más barato y lo que la persona escribe a mano— y después por código.
 * Devuelve `null` cuando no hay match, para que el llamador muestre el buscador de tiendas de
 * siempre en vez del resultado de pallet.
 *
 * Una `query` que no sea ni número ni código conocido NO se fuerza: mejor no encontrar nada que
 * abrir la tienda equivocada con un pallet que no es.
 */
export function buscarPallet<Slot extends SlotDePallet>(
  slotsPorTienda: Record<string, readonly Slot[]>,
  query: string,
): PalletEncontrado<Slot> | null {
  const q = String(query ?? '').trim();
  if (!q) return null;

  if (/^\d+$/.test(q)) {
    const id = Number(q);
    for (const [claveTienda, slots] of Object.entries(slotsPorTienda)) {
      const slot = slots.find(s => s.id === id);
      if (slot) return { claveTienda, slot, via: 'numero' };
    }
    // Un número que no calza NO sigue a la búsqueda por código: un canonical jamás es solo dígitos.
    return null;
  }

  const objetivo = canon(q);
  if (!objetivo) return null;
  for (const [claveTienda, slots] of Object.entries(slotsPorTienda)) {
    const slot = slots.find(s => s.canonical_id && canon(s.canonical_id) === objetivo);
    if (slot) return { claveTienda, slot, via: 'codigo' };
  }
  return null;
}
