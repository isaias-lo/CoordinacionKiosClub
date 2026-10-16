// Cuál de dos versiones del MISMO ítem es la buena, cuando dos equipos no están de acuerdo. Puro.
//
// ── POR QUÉ (01TPS, 14/10/2026) ────────────────────────────────────────────────────────────────
//
// El estado de Bodega es UNA fila por día en `shared_session_state`, y cada equipo la escribe
// entera: gana el último que escribe. El merge de tres vías (`mergeItems.ts`) protege lo que este
// equipo cambió y no empujó todavía, pero en una tienda que este equipo NO tocó adopta lo remoto
// tal cual. Y lo remoto puede ser una copia VIEJA: la de un equipo que empujó por otra tienda
// antes de haber recibido el cambio de esta.
//
// Fue exactamente lo de 01TPS:
//
//     15:46:57  Isaias guarda P2 sin pesar (0 kg)
//     16:16:17  Daniel (asistente) lo pesa: 72,5 kg
//     16:24:10  Isaias lo vuelve a guardar con 72,5 — en su equipo P2 seguía «sin pesar»
//     17:32:19  Isaias lo guarda con 92 — otra vez sin un peso previo en su equipo
//
// Ninguno de los dos guardados de Isaias registró «reingreso», o sea que en su equipo el P2 no
// tenía peso: el de Daniel se perdió, y después el suyo también. El peso sí quedó en
// `picking_pallets` (por eso la tarjeta lo traía escrito), lo que se perdía era el ítem de Bodega.
//
// ── LA REGLA ───────────────────────────────────────────────────────────────────────────────────
//
// 1. Cada ítem lleva `editadoEn`: la hora en que alguien cambió de verdad su carga (peso, medidas,
//    tipo, guía…). Renumerar no cuenta: no es un cambio de nadie, y una copia vieja renumerada
//    no debe parecer nueva. Entre dos versiones selladas, gana la más nueva.
// 2. Si alguna no tiene sello (ítems de antes de esto, o un equipo con la versión vieja de la app
//    abierta), la versión pesada le gana a la «sin pesar» de la misma unidad. Un «sin pesar»
//    nunca pisa un peso a propósito: `fusionarConPrevio` ya conserva las medidas en ese caso.
// 3. Si nada de eso decide, `null`: el merge sigue con su regla de siempre.

import { esSinPesar } from './sinPesar';

export interface ItemConVersion {
  peso?: number | null;
  tipo?: string | null;
  pkg?: string | null;
  palletWeb?: boolean | null;
  editadoEn?: number;
}

/** Campos que NO son carga: cambiarlos no es «editar» el ítem. */
const NO_ES_CARGA = new Set(['orden', 'editadoEn']);

function carga(item: object): string {
  const o = item as Record<string, unknown>;
  return JSON.stringify(Object.keys(o).filter(k => !NO_ES_CARGA.has(k)).sort().map(k => [k, o[k]]));
}

export function elegirVersion<T extends ItemConVersion>(local: T, remoto: T): 'local' | 'remoto' | null {
  if (carga(local) === carga(remoto)) return null;
  const tl = local.editadoEn, tr = remoto.editadoEn;
  if (typeof tl === 'number' && typeof tr === 'number' && tl !== tr) return tl > tr ? 'local' : 'remoto';
  const sinL = esSinPesar(local), sinR = esSinPesar(remoto);
  if (sinL && !sinR) return 'remoto';
  if (sinR && !sinL) return 'local';
  return null;
}

/**
 * Sella con `ahora` los ítems de `despues` cuya carga cambió respecto de `antes` (o que son
 * nuevos). Los demás quedan con su sello. Lo usan los reducers de los dos espejos en cada cambio
 * LOCAL; lo que llega de otro equipo (LOAD_STATE) no se sella, trae el suyo.
 *
 * Devuelve el MISMO arreglo si no hubo nada que sellar.
 */
export function sellarCambios<T extends ItemConVersion>(
  antes: readonly T[],
  despues: T[],
  llave: (item: T) => string,
  ahora: number,
): T[] {
  const previos = new Map<string, T>();
  for (const i of antes) { const k = llave(i); if (k) previos.set(k, i); }
  let cambio = false;
  const out = despues.map(i => {
    const k = llave(i);
    const prev = k ? previos.get(k) : undefined;
    if (prev && carga(prev) === carga(i)) {
      // Misma carga. Si al reconstruirlo se perdió el sello, se le devuelve el que tenía.
      if (i.editadoEn === undefined && prev.editadoEn !== undefined) { cambio = true; return { ...i, editadoEn: prev.editadoEn }; }
      return i;
    }
    cambio = true;
    return { ...i, editadoEn: ahora };
  });
  return cambio ? out : despues;
}
