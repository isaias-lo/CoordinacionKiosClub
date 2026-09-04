// Sincronizar el tablero sin pisar el trabajo del otro dispositivo.
//
// El tablero se guardaba como un bloque entero por día y ganaba el último que escribía. Con dos
// personas trabajando —o con la misma persona en el celular y el computador— eso significa que uno
// de los dos pierde todo lo que hizo, sin aviso.
//
// Bodega ya resolvió esto con un merge de tres vías por ítem (`mergeItemsByTienda`). Acá se aplica
// el mismo patrón, pero con LA TIENDA como clave en vez del camión, porque esa es la unidad real:
// una tienda vive en exactamente un camión. Si el merge fuera por patente, una tienda movida en dos
// equipos aparecería en los dos camiones a la vez.
//
// No se usan marcas de tiempo a propósito: dependerían del reloj de cada equipo, y ya hubo
// problemas por desfases. Las tres vías (base, local, remoto) resuelven el conflicto sin relojes.

import type { StoreItem } from './routing';

/** Dónde está una tienda y con qué carga. `patente: null` = se sacó del tablero. */
export interface UbicacionTienda {
  patente: string | null;
  p: number;
  b: number;
  ch: number;
}

/** El tablero visto por tienda: la forma con la que se puede hacer merge sin duplicar. */
export type TableroPorTienda = Record<string, UbicacionTienda>;

/** El tablero como lo consume la pantalla: por patente. */
export type TableroPorCamion = Record<string, StoreItem[]>;

/** Pasa del tablero de la pantalla al indexado por tienda. */
export function porTienda(asignaciones: TableroPorCamion): TableroPorTienda {
  const out: TableroPorTienda = {};
  for (const [patente, tiendas] of Object.entries(asignaciones ?? {})) {
    for (const t of tiendas ?? []) {
      if (!t?.c) continue;
      out[t.c] = { patente, p: t.p ?? 0, b: t.b ?? 0, ch: t.ch ?? 0 };
    }
  }
  return out;
}

/**
 * Vuelve al tablero por patente. Las tiendas sacadas (`patente: null`) no aparecen.
 *
 * `patentesVivas` conserva los camiones que quedaron sin tiendas pero siguen en el tablero; sin
 * eso, vaciar un camión lo haría desaparecer de la pantalla en vez de quedar vacío.
 */
export function porCamion(t: TableroPorTienda, patentesVivas: string[] = []): TableroPorCamion {
  const out: TableroPorCamion = {};
  for (const p of patentesVivas) out[p] = [];
  for (const [cod, u] of Object.entries(t)) {
    if (!u.patente) continue;
    (out[u.patente] ??= []).push({ c: cod, p: u.p, b: u.b, ch: u.ch });
  }
  return out;
}

const mismaUbicacion = (a?: UbicacionTienda, b?: UbicacionTienda): boolean =>
  (a?.patente ?? null) === (b?.patente ?? null) &&
  (a?.p ?? 0) === (b?.p ?? 0) && (a?.b ?? 0) === (b?.b ?? 0) && (a?.ch ?? 0) === (b?.ch ?? 0);

/**
 * Merge de tres vías, tienda por tienda.
 *
 * `base` es lo último que este equipo sincronizó. La regla, por tienda:
 *
 *   · no la toqué desde el último sync  → me quedo con la remota (trae el trabajo del otro
 *                                          equipo; que no venga significa que la sacaron)
 *   · la moví yo                         → gana la mía (estoy trabajando en ella ahora)
 *
 * Así conviven los dos: si un equipo asigna 40LIL y el otro 26ALC, quedan las dos. Antes ganaba
 * el último en escribir y el otro perdía todo su trabajo.
 *
 * `protegida` marca tiendas que no se pueden mover pase lo que pase — las de un camión ya cerrado,
 * cuyo manifiesto y QR ya salieron.
 */
export function mergeTablero(
  remoto: TableroPorTienda,
  local: TableroPorTienda,
  base: TableroPorTienda,
  protegida: (cod: string) => boolean = () => false,
): TableroPorTienda {
  const out: TableroPorTienda = {};
  const cods = new Set([...Object.keys(remoto), ...Object.keys(local)]);

  for (const cod of cods) {
    const loc = local[cod];
    const rem = remoto[cod];

    // Un camión cerrado ya emitió su manifiesto: su carga no se toca, venga lo que venga.
    if (protegida(cod)) { if (loc) out[cod] = loc; continue; }

    // No la toqué → adopto lo remoto. Si no viene, es que la sacaron en el otro equipo.
    if (mismaUbicacion(loc, base[cod])) { if (rem) out[cod] = rem; continue; }

    // La moví yo → gana lo mío.
    if (loc) out[cod] = loc;
  }
  return out;
}

/**
 * Patentes que deben seguir en el tablero aunque queden sin tiendas.
 *
 * Un camión del que se sacó la última tienda sigue estando en el tablero, vacío. Sin esto
 * desaparecería de la pantalla al sincronizar, y parecería que alguien lo apagó.
 */
export function patentesDelTablero(...tableros: TableroPorCamion[]): string[] {
  const out = new Set<string>();
  for (const t of tableros) for (const p of Object.keys(t ?? {})) out.add(p);
  return [...out];
}
