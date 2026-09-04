// Merge del Planificador entre dispositivos, ruta por ruta.
//
// El Planificador nunca salió del navegador: vivía solo en `localStorage`, así que una ruta armada
// en el celular no existía en el computador. No era un sync roto — era una función que faltaba.
//
// Al agregarla no sirve guardar el plan como un bloque y que gane el último: dos personas —o la
// misma en dos equipos— trabajando rutas distintas se borrarían entre sí, que es exactamente lo
// que se acaba de arreglar en el tablero. Las rutas tienen `id` estable, así que se aplica el mismo
// merge de tres vías, con la RUTA como unidad.

export interface RutaPlan { id: string; nombre?: string; [k: string]: unknown }

/** Compara dos rutas por contenido; el orden de las claves no importa. */
function iguales(a?: RutaPlan, b?: RutaPlan): boolean {
  if (!a || !b) return a === b;
  const norm = (r: RutaPlan) => JSON.stringify(Object.keys(r).sort().map(k => [k, r[k]]));
  return norm(a) === norm(b);
}

/**
 * Fusiona las rutas del plan. Por ruta:
 *
 *   · no la toqué desde el último sync → me quedo con la remota (si no viene, la borraron allá)
 *   · la edité yo                       → gana la mía
 *
 * El ORDEN sale de lo remoto primero y después lo local, para que una ruta nueva de cualquiera de
 * los dos lados quede al final en vez de reordenar el plan del otro sin motivo.
 */
export function mergeRutasPlan(
  remotas: RutaPlan[],
  locales: RutaPlan[],
  base: RutaPlan[],
): RutaPlan[] {
  const idx = (rs: RutaPlan[]) => new Map(rs.filter(r => r?.id).map(r => [r.id, r]));
  const R = idx(remotas), L = idx(locales), B = idx(base);

  const out: RutaPlan[] = [];
  const puestas = new Set<string>();
  const poner = (id: string) => {
    if (puestas.has(id)) return;
    const loc = L.get(id), rem = R.get(id);
    // Sin versión local: es de otro equipo, entra tal cual.
    if (!loc) { if (rem) { out.push(rem); puestas.add(id); } return; }
    // Sin tocar desde el último sync → adopto la remota; si no viene, se borró allá.
    if (iguales(loc, B.get(id))) { if (rem) { out.push(rem); puestas.add(id); } return; }
    // La edité yo → gana la mía.
    out.push(loc); puestas.add(id);
  };

  for (const r of remotas) if (r?.id) poner(r.id);
  for (const r of locales) if (r?.id) poner(r.id);
  return out;
}

/** Un plan sin rutas no es válido: la pantalla necesita al menos una para editar. */
export function conAlMenosUna(rutas: RutaPlan[], porDefecto: RutaPlan): RutaPlan[] {
  return rutas.length ? rutas : [porDefecto];
}
