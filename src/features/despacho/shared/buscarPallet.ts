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
 * La misma forma, pero con la Ñ BORRADA en vez de convertida en N.
 *
 * Es lo que de verdad imprimían las etiquetas de 23PEÑ y 37VIÑ hasta el 9 oct 2026: JsBarcode no
 * acepta la Ñ en Code128, tiraba error, y `Barcode1D` reintentaba quitando todo lo que no fuera
 * ASCII. El código quedaba `1B37VI21092026B` y la handheld leía eso, que no calzaba con nada.
 * Las etiquetas nuevas llevan N (ver `textoParaCodigoDeBarras`); esto es para las que ya andan
 * impresas por la bodega.
 */
function canonSinEnie(s: string): string {
  return canon(String(s ?? '').replace(/[ñÑ]/g, ''));
}

/** Lo que va dentro del Code128: la Ñ como N y nada fuera de ASCII imprimible. */
export function textoParaCodigoDeBarras(s: string): string {
  return String(s ?? '').replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '');
}

/**
 * Los `canonical_id` que puede haber detrás de lo leído, para buscar en la base (que guarda la Ñ).
 *
 * Una etiqueta de 37VIÑ llega como `…37VIN…` (las nuevas) o `…37VI…` (las viejas, sin la Ñ). Se
 * ubica el código de tienda —dos dígitos y letras justo antes de la fecha de 8 dígitos— y se
 * prueban sus letras con cada N cambiada por Ñ y con una Ñ agregada en cada posición. Son pocas
 * variantes y todas tienen que calzar EXACTO con algo guardado, así que no abre la puerta a otra tienda.
 */
export function variantesDeCodigo(codigo: string): string[] {
  const c = String(codigo ?? '').trim().toUpperCase();
  const out = new Set<string>([c]);
  const m = c.match(/^(.*\d{2})([A-ZÑ]{1,5})(\d{8}[A-Z]*)$/);
  if (m) {
    const [, antes, letras, despues] = m;
    for (let i = 0; i < letras.length; i++) {
      if (letras[i] === 'N') out.add(`${antes}${letras.slice(0, i)}Ñ${letras.slice(i + 1)}${despues}`);
    }
    for (let i = 0; i <= letras.length; i++) out.add(`${antes}${letras.slice(0, i)}Ñ${letras.slice(i)}${despues}`);
  }
  return [...out];
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
  // Etiqueta vieja de una tienda con Ñ, impresa sin la Ñ (ver `canonSinEnie`). Solo si no calzó
  // nada antes, y solo contra códigos que de verdad tienen Ñ.
  for (const [claveTienda, slots] of Object.entries(slotsPorTienda)) {
    const slot = slots.find(s => s.canonical_id && /[ñÑ]/.test(s.canonical_id) && canonSinEnie(s.canonical_id) === objetivo);
    if (slot) return { claveTienda, slot, via: 'codigo' };
  }
  return null;
}
