// El pallet MIXTO que no se cuenta en esta pestaña, pero sí lleva carga de ella. PURO.
//
// ── EL CASO ───────────────────────────────────────────────────────────────────────────────────
//
// 07/10/2026, tienda 41ANA: Cristian Morales hizo dos operaciones de Odoo en el mismo batch —una
// de Aseo y una de Hogar— y armó UN solo pallet, el slot #1533. La base lo guardó bien:
// `contenido = 'aseo-hogar'`. Pero la columna `section` guarda LA PESTAÑA QUE ESTABA ACTIVA al
// crearlo (`PickingScreen.tsx`), así que quedó en `hogar` y en la pestaña ASEO no se ve nada:
// «0 pallets» y el recuadro vacío de siempre.
//
// El riesgo no es cosmético: quien trabaja Aseo ve 0 y arma el pallet de nuevo. Dos slots para
// una unidad física.
//
// ── ES SIMÉTRICO, Y HAY UN TERCER CASO ────────────────────────────────────────────────────────
//
// El mecanismo no sabe nada de «Hogar» ni de «Aseo»: guarda la pestaña activa. Creado desde ASEO,
// la ciega sería HOGAR. Y creado desde TODAS un mixto no tiene UNA sección —`seccionDeGrupo`
// devuelve `null`— así que no se ve en NINGUNA.
//
// Medido sobre `picking_pallets` el 07/10/2026: **79 slots** invisibles en toda pestaña de
// sección (9 días, 35 tiendas) y **153** parados en `hogar` llevando más de una categoría (48
// tiendas). Por eso el aviso NO puede decir «está en HOGAR» fijo: tiene que decir dónde está de
// verdad, y saber decir que no está en ninguna.
//
// ── POR QUÉ UN AVISO Y NO MOSTRARLO EN LAS DOS ────────────────────────────────────────────────
//
// Mostrar la misma unidad en las dos pestañas haría que el contador dijera 1 en HOGAR y 1 en
// ASEO para un solo pallet. En este sistema el error caro es justamente ese —un número que no
// calza con lo físico—, así que el conteo se queda en un solo lugar y acá va un aviso que dice
// dónde mirarlo. Decisión del coordinador, sobre dos bocetos.

import { seccionDeSlot, categoriasDeContenido, type Seccion } from './picking-secciones';

/** La categoría de Odoo que corresponde a cada sección. */
const CATEGORIA_DE_SECCION: Record<Seccion, string> = {
  comida: 'Comida', aseo: 'Aseo', hogar: 'Hogar',
  chocolates: 'Chocolates', congelados: 'Congelados',
};

/** Cómo se llama cada pestaña en pantalla. */
const NOMBRE_DE_SECCION: Record<Seccion, string> = {
  comida: 'COMIDA', aseo: 'ASEO', hogar: 'HOGAR',
  chocolates: 'CHOCOLATES', congelados: 'CONGELADOS',
};

/** Lo mínimo de un pallet para decidir. */
export interface SlotParaAviso {
  id: number;
  /** `undefined` igual que en `PalletSlot`: un pallet viejo puede no tener la columna. */
  section?: string | null;
  contenido: string;
}

export interface PalletAjeno {
  slotId: number;
  /** Dónde SÍ se cuenta. `null` = en ninguna sección; solo aparece en «Todas». */
  seccion: Seccion | null;
}

/**
 * Los pallets del grupo que llevan carga de `seccionActiva` pero NO se cuentan en ella.
 *
 * Dos condiciones, y las dos hacen falta:
 *   1. no se cuenta acá — si no, no hay nada que avisar;
 *   2. su CONTENIDO nombra esta sección — si no, es un pallet de otra cosa y el aviso sería ruido.
 *      Un picker con un pallet solo de Hogar y otro solo de Aseo no genera ningún aviso.
 */
export function palletsDeOtraSeccion(
  slots: readonly SlotParaAviso[],
  seccionActiva: Seccion,
): PalletAjeno[] {
  const categoria = CATEGORIA_DE_SECCION[seccionActiva];
  const out: PalletAjeno[] = [];
  for (const s of slots) {
    const sec = seccionDeSlot(s);
    if (sec === seccionActiva) continue;
    if (!categoriasDeContenido(s.contenido).includes(categoria)) continue;
    out.push({ slotId: s.id, seccion: sec });
  }
  return out;
}

/** El texto del aviso, o `null` si no hay nada que avisar. */
export function textoDelAviso(ajenos: readonly PalletAjeno[]): string | null {
  if (ajenos.length === 0) return null;
  const n = ajenos.length;
  const unidades = n === 1 ? '1 pallet mixto' : `${n} pallets mixtos`;
  const ids = ajenos.map(a => `#${a.slotId}`).join(' · ');
  const destinos = new Set(ajenos.map(a => a.seccion));
  if (destinos.size === 1) {
    const [sec] = [...destinos];
    return sec
      ? `${unidades} de este picker ya está en ${NOMBRE_DE_SECCION[sec]} · ${ids}`
      : `${unidades} de este picker no está en ninguna sección — míralo en TODAS · ${ids}`;
  }
  return `${unidades} de este picker se cuentan en otras secciones · ${ids}`;
}

/** A qué pestaña lleva el botón. `'all'` cuando no hay una sola sección a la que ir. */
export function destinoDelAviso(ajenos: readonly PalletAjeno[]): Seccion | 'all' | null {
  if (ajenos.length === 0) return null;
  const destinos = new Set(ajenos.map(a => a.seccion));
  if (destinos.size !== 1) return 'all';
  const [sec] = [...destinos];
  return sec ?? 'all';
}

/** El texto del botón: «Ver en HOGAR», «Ver en TODAS». */
export function textoDelBoton(destino: Seccion | 'all' | null): string | null {
  if (!destino) return null;
  return `Ver en ${destino === 'all' ? 'TODAS' : NOMBRE_DE_SECCION[destino]}`;
}
