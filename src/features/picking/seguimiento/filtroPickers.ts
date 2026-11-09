// Qué filas de Estadísticas son de pickers y cuáles no. Módulo puro: entran filas, salen dos
// montones y la cuenta de lo que quedó fuera.
//
// ── POR QUÉ EXISTE ────────────────────────────────────────────────────────────────────────────
//
// La pantalla no muestra a todos los responsables de Odoo: ahí aparecen cuentas de sistema y
// gente que no pickea. El filtro era una línea dentro de `StatsTab`:
//
//     cache.rows.filter(r => isAllowedPicker(r.name) || knownPickers.has(r.name...))
//
// y la lista contra la que preguntaba son **cuentas** de Odoo: «Pickers 11», «Adquisiciones».
// Hasta el #788 la fila se llamaba igual que la cuenta y eso calzaba. El #788 fusionó las filas
// por PERSONA —para que quien usó dos pistolas no saliera en dos filas— y desde entonces
// `r.name` es «Diego Farr». Ninguna persona está en una lista de cuentas, así que el filtro se
// las comió todas.
//
// Sobrevivió exactamente UNA fila, y el motivo lo explica entero: `control interno` es la única
// de las 31 entradas de `picker_canonical_names` cuyo `key` es igual a su `display_name`. Medido
// el 09/11/2026 contra Odoo:
//
//     día 09/11   antes del #788  24 filas · 78 ops   →  después  1 fila · 10 ops
//     nov 1 al 9  antes del #788  28 filas · 743 ops  →  después  1 fila · 72 ops
//     octubre     antes del #788  28 filas · 2.865 ops→  después  1 fila · 374 ops
//
// Esos 10 y 72 son los que se veían en pantalla. No era que Odoo no tuviera datos.
//
// ── POR QUÉ SE PREGUNTA POR LA CUENTA Y NO POR EL NOMBRE ──────────────────────────────────────
//
// Porque la lista se administra por cuenta: las built-in de `CANONICAL_PICKER_KEYS` y las que se
// agregan en Config son pistolas, no personas. Traducir la lista a nombres sería la otra mitad
// del mismo enredo —habría dos listas que mantener sincronizadas—, y además una persona puede
// aportar DOS cuentas a la misma fila: basta con que una esté en la lista.
//
// ── Y POR QUÉ SE CUENTA LO QUE QUEDA FUERA ────────────────────────────────────────────────────
//
// Un filtro silencioso es lo que hizo que esto durara: la pantalla decía 72 operaciones y nadie
// podía saber que Odoo tenía 868. Lo que no entra se devuelve contado y con nombre, para que la
// pantalla pueda decirlo. Octubre tenía 471 operaciones de cuentas que no están en la lista
// —410 de ellas de una sola, «Mario Patiño»— y eso es una decisión de Config, no un detalle.

/** Lo mínimo que necesita una fila para saber si entra. Lo cumple `RendimientoPicker`. */
export interface FilaDePicker {
  /** Desde el #788, la PERSONA. En filas guardadas por una versión anterior, la cuenta. */
  name: string;
  /** Las cuentas de Odoo que aportaron a la fila. Ausente en lo guardado antes del #788. */
  cuentas?: string[];
  ops: number;
}

export interface Reparto<T> {
  /** Las filas de pickers, en el orden en que venían. */
  dentro: T[];
  /** Las que no están en la lista. No se tiran: se cuentan y se nombran. */
  fuera: T[];
  /** Operaciones de las filas que quedaron fuera. */
  opsFuera: number;
  /** Las cuentas de Odoo de lo que quedó fuera, sin repetir y de mayor a menor en operaciones. */
  cuentasFuera: string[];
}

/**
 * Las cuentas de Odoo de una fila.
 *
 * Con `cuentas` presente son esas. Sin él —una fila guardada en el navegador antes del #788— el
 * `name` ES la cuenta, así que un cache viejo sigue filtrándose bien en vez de vaciar la
 * pantalla hasta que alguien aprieta «Actualizar datos».
 */
export function cuentasDe(fila: FilaDePicker): string[] {
  return fila.cuentas && fila.cuentas.length > 0 ? fila.cuentas : [fila.name];
}

/**
 * Separa las filas de pickers de las que no lo son.
 *
 * `esDePickers` recibe una CUENTA de Odoo. Quién decide eso es de quien llama: la lista built-in
 * más lo agregado en Config. Acá no se sabe ni se quiere saber.
 *
 * Una fila entra si **alguna** de sus cuentas está en la lista: dos pistolas de la misma persona
 * son la misma persona, y pedir que estén las dos la dejaría fuera por un trámite de Config.
 */
export function repartirPorListaDePickers<T extends FilaDePicker>(
  filas: readonly T[],
  esDePickers: (cuenta: string) => boolean,
): Reparto<T> {
  const dentro: T[] = [];
  const fuera: T[] = [];

  for (const f of filas) {
    if (cuentasDe(f).some(esDePickers)) dentro.push(f);
    else fuera.push(f);
  }

  // Las cuentas de lo que quedó fuera, ordenadas por peso: en octubre una sola explicaba 410 de
  // las 471 operaciones, y eso se pierde en una lista alfabética.
  const opsPorCuenta = new Map<string, number>();
  for (const f of fuera) {
    for (const c of cuentasDe(f)) opsPorCuenta.set(c, (opsPorCuenta.get(c) ?? 0) + f.ops);
  }

  return {
    dentro,
    fuera,
    opsFuera: fuera.reduce((s, f) => s + f.ops, 0),
    cuentasFuera: [...opsPorCuenta.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([c]) => c),
  };
}

/** «Mario Patiño», «Mario Patiño y 1 más», «Mario Patiño, Abastecimiento y 3 más». */
export function textoCuentasFuera(cuentas: readonly string[], aMostrar = 2): string {
  if (cuentas.length === 0) return '';
  const visibles = cuentas.slice(0, aMostrar);
  const resto = cuentas.length - visibles.length;
  if (resto === 0) {
    return visibles.length === 1 ? visibles[0] : `${visibles.slice(0, -1).join(', ')} y ${visibles[visibles.length - 1]}`;
  }
  return `${visibles.join(', ')} y ${resto} más`;
}
