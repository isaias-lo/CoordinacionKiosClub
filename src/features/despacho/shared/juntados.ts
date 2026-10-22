import { clasificarContenido, nombreContenido, type ClaseContenido } from './contenidoCarga';

// Lo que se le juntó a una unidad, para verlo sin entrar. Puro y testeable.
//
// Existe por el análisis del 22/10/2026. Unir dos pallets dejaba el chip «Unificado · 2 en 1»,
// pero sumarle un chocolate o un bulto solo cambiaba el peso: el CH desaparecía de la lista y en el
// pallet no quedaba rastro. En LAS BRUJAS, P1 terminó con P2 y un CH adentro, y el chip decía «2 en
// 1». Isaias pidió dos cosas: saber si a un pallet le sumaron chocolates sin entrar uno por uno, y
// que al unir se vea de qué tipo era cada pallet («si se unió pallet de aseo y comida»).
//
// Viaja dentro del ítem de Bodega (`juntado`), como `unidos`: el estado ya se comparte entre
// equipos, así que no hace falta una columna nueva en la base.

/** Bultos (B) y chocolates (CH) que se le sumaron. */
export type ClaseSumada = 'B' | 'CH';

export interface Juntado {
  /**
   * El tipo de carga de cada pallet o contenedor que formó esta unidad, el que sobrevive primero.
   * Solo si se unificó. Una unión hecha antes del 22/10 no lo trae: ahí no se sabe.
   */
  partes?: ClaseContenido[];
  /** Cuántos bultos se le sumaron. */
  B?: number;
  /** Cuántos chocolates se le sumaron. */
  CH?: number;
}

const n = (v?: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** Lo que trae una unidad: lo que ya se le juntó o, si nada, ella sola con su tipo. */
function partesDe(j: Juntado | null | undefined, tipo: string): ClaseContenido[] {
  return j?.partes?.length ? j.partes : [clasificarContenido(tipo)];
}

/** Junta dos registros sin perder nada: las partes en orden, los conteos sumados. */
function sumarConteos(a?: Juntado | null, b?: Juntado | null): Pick<Juntado, 'B' | 'CH'> {
  const out: Pick<Juntado, 'B' | 'CH'> = {};
  const B = n(a?.B) + n(b?.B), CH = n(a?.CH) + n(b?.CH);
  if (B) out.B = B;
  if (CH) out.CH = CH;
  return out;
}

/**
 * Lo que queda en la unidad que sobrevive al unir `origen` con `destino`. Si cualquiera ya venía
 * unificada o con algo sumado, se arrastra: P1 (Comida) + P2 (Aseo, con un CH) = Comida + Aseo, 1 CH.
 */
export function juntadoTrasUnir(
  destino: { juntado?: Juntado | null; tipo: string },
  origen: { juntado?: Juntado | null; tipo: string },
): Juntado {
  return {
    partes: [...partesDe(destino.juntado, destino.tipo), ...partesDe(origen.juntado, origen.tipo)],
    ...sumarConteos(destino.juntado, origen.juntado),
  };
}

/**
 * Lo que queda en el pallet al sumarle bultos o chocolates. `clases` es una por unidad sumada; lo
 * que no sea B ni CH no cuenta.
 */
export function juntadoTrasSumar(destino: Juntado | null | undefined, clases: string[]): Juntado {
  const sumado: Juntado = {};
  for (const c of clases) {
    if (c === 'B') sumado.B = n(sumado.B) + 1;
    else if (c === 'CH') sumado.CH = n(sumado.CH) + 1;
  }
  const out: Juntado = { ...sumarConteos(destino, sumado) };
  if (destino?.partes?.length) out.partes = destino.partes;
  return out;
}

/** Cuántas cosas lleva registradas. Sirve para quedarse con el registro más completo. */
export function cuantoJuntado(j?: Juntado | null): number {
  return (j?.partes?.length ?? 0) + n(j?.B) + n(j?.CH);
}

/**
 * Al volver a guardar una unidad gana lo nuevo, pero lo que se le juntó no se deshace: si el
 * previo llevaba más, se queda el previo. Igual que `unidos` en `fusionarConPrevio`.
 */
export function juntadoMasCompleto(previo?: Juntado | null, nuevo?: Juntado | null): Juntado | undefined {
  const elegido = cuantoJuntado(previo) > cuantoJuntado(nuevo) ? previo : nuevo;
  return elegido && cuantoJuntado(elegido) > 0 ? elegido : undefined;
}

/**
 * «+2 CH · +1 B», en el orden en que importan (el chocolate es lo que se pierde de vista). `null`
 * si no se le sumó nada.
 */
export function textoSumados(j?: Juntado | null): string | null {
  const partes: string[] = [];
  if (n(j?.CH)) partes.push(`+${n(j?.CH)} CH`);
  if (n(j?.B)) partes.push(`+${n(j?.B)} B`);
  return partes.length ? partes.join(' · ') : null;
}

/**
 * «Comida + Aseo»: de qué tipo era cada pallet que se unió. Dos iguales se cuentan: «Comida ×2 +
 * Aseo». `null` si no hay al menos dos partes registradas.
 */
export function textoPartes(j?: Juntado | null): string | null {
  const partes = j?.partes ?? [];
  if (partes.length < 2) return null;
  const cuenta = new Map<string, number>();
  for (const p of partes) {
    const nombre = nombreContenido(p);
    cuenta.set(nombre, (cuenta.get(nombre) ?? 0) + 1);
  }
  return [...cuenta].map(([nombre, k]) => (k > 1 ? `${nombre} ×${k}` : nombre)).join(' + ');
}

/**
 * La línea de detalle: «Se unió Comida + Aseo · se le sumaron 2 CH». `null` si no hay nada que
 * contar. Sirve para la fila, la lista de tiendas y el Resumen.
 */
export function lineaJuntado(j?: Juntado | null): string | null {
  const trozos: string[] = [];
  const partes = textoPartes(j);
  if (partes) trozos.push(`Se unió ${partes}`);
  const sumados: string[] = [];
  if (n(j?.CH)) sumados.push(`${n(j?.CH)} CH`);
  if (n(j?.B)) sumados.push(`${n(j?.B)} B`);
  if (sumados.length) {
    const total = n(j?.CH) + n(j?.B);
    trozos.push(`${total === 1 ? 'se le sumó' : 'se le sumaron'} ${sumados.join(' y ')}`);
  }
  if (!trozos.length) return null;
  const linea = trozos.join(' · ');
  return linea.charAt(0).toUpperCase() + linea.slice(1);
}

/** Lo juntado en una tienda entera, para verlo en la lista de tiendas y en el Resumen sin entrar. */
export interface JuntadoTienda {
  /** Unidades que se formaron uniendo dos o más. */
  unificadas: number;
  /** Chocolates que quedaron dentro de un pallet. */
  CH: number;
  /** Bultos que quedaron dentro de un pallet. */
  B: number;
}

/** Suma lo juntado de los ítems de una tienda. Una unión de antes del 22/10 cuenta por `unidos`. */
export function juntadoDeTienda(items: { unidos?: number; juntado?: Juntado | null }[]): JuntadoTienda {
  const out: JuntadoTienda = { unificadas: 0, CH: 0, B: 0 };
  for (const i of items) {
    if (n(i.unidos) > 0 || (i.juntado?.partes?.length ?? 0) > 1) out.unificadas += 1;
    out.CH += n(i.juntado?.CH);
    out.B += n(i.juntado?.B);
  }
  return out;
}

/** «1 unificado · 2 CH dentro · 1 B dentro». `null` si en la tienda no se juntó nada. */
export function textoJuntadoTienda(t?: JuntadoTienda | null): string | null {
  if (!t) return null;
  const partes: string[] = [];
  if (t.unificadas) partes.push(`${t.unificadas} ${t.unificadas === 1 ? 'unificado' : 'unificados'}`);
  if (t.CH) partes.push(`${t.CH} CH dentro`);
  if (t.B) partes.push(`${t.B} B dentro`);
  return partes.length ? partes.join(' · ') : null;
}
