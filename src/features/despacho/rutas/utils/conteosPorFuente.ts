// Una tienda, dos espejos de Bodega, un solo conteo. Puro y testeable.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────────────────────────
//
// «Hay bultos que no le aparecían; los pallets y los bultos salían mal.» El 29/09, en el Enrutador,
// 36CHL mostraba 2 pallets y 0 bultos cuando tenía 4 y 8.
//
// No es del rol de quien lo vio ni de los permisos: las tablas que el Enrutador lee tienen política
// RLS `{authenticated}` y sus APIs usan `verifyAuth`. Le pasaba a todo el mundo.
//
// La causa es que una tienda puede tener DOS filas en `despacho_sesion`, una por espejo —
// `pushCounts('regiones', …)` desde Nacional y `pushCounts('santiago', …)` desde RM/Costa—, y
// `applyRow` las indexaba solo por código, ignorando `fuente`. Ganaba la última que llegara:
//
//     36CHL   regiones 4P·8B     santiago 2P·0B     → se veía 2P·0B
//     46TRE   regiones 4P·5B     santiago 1P·0B     → se veía 1P·0B
//     31TLC   regiones 2P·2B     santiago 1P·0B     → se veía 1P·0B
//
// Ocho tiendas de Región tenían las dos filas, y en TODAS la de `santiago` traía los bultos en 0.
//
// ── POR QUÉ EL MÁXIMO Y NO LA SUMA ─────────────────────────────────────────────────────────────
//
// Es la parte que hubo que medir antes de escribir nada, porque la respuesta intuitiva —sumar— es
// la equivocada. Las unidades de los dos espejos SE SOLAPAN: el 29/09 RM/Costa tenía 2 pallets de
// 36CHL (slots 216 y 247) y Nacional tenía 4, que INCLUÍAN esos dos, con el mismo peso. Sumar
// habría dado 6 pallets en una tienda que tiene 4.
//
// Tampoco sirve quedarse con la más reciente: las filas de `santiago` eran las más nuevas (20:51
// contra 20:48) y eran justamente las malas.
//
// El máximo por campo acertó en las ocho tiendas, contrastado contra los slots reales de
// `picking_pallets`. Tiene además la propiedad que importa: un subconjunto NUNCA puede superar al
// conjunto, así que el máximo no puede quedar por debajo de la verdad — y jamás inventa carga,
// porque todo número que devuelve lo reportó algún espejo.
//
// Lo que este módulo NO arregla es que existan filas de más. Eso viene de `pushCounts`, que solo
// borra las de tiendas que ese cliente todavía tiene en pantalla; su comentario lo acepta a
// propósito: «más vale una fila fantasma que perder carga ajena». Es un buen trato — el error
// estaba en dejar que la fantasma PISARA a la buena.

import type { SesionRow } from '@/lib/despachoSesion';

/** Las filas de una tienda, una por fuente. */
export type FilasDeTienda = Map<string, SesionRow>;

/** Lo que recuerda el Enrutador: código de tienda → sus filas por fuente. */
export type MemoriaSesion = Map<string, FilasDeTienda>;

const n = (v: number | null | undefined) => (typeof v === 'number' && v > 0 ? v : 0);

/** La carga total de una fila, para decidir cuál manda. */
export function cargaDeFila(r: SesionRow): number {
  return n(r.pallets) + n(r.bultos) + n(r.contenedores) + n(r.chocolates);
}

/**
 * Las filas de una tienda, combinadas en una sola.
 *
 * Cada envase se lleva el MÁXIMO que haya reportado cualquier espejo (ver el encabezado). La
 * `fuente` del resultado es la del espejo que más carga trajo, porque de ella sale el GRUPO en que
 * la tienda se dibuja (`grupoArmada`): si mandara la fila menor, una tienda de Región podría
 * aparecer entre las de Santiago.
 */
export function combinarFilas(filas: Iterable<SesionRow>): SesionRow | null {
  let out: SesionRow | null = null;
  let mejorCarga = -1;
  for (const f of filas) {
    if (!out) {
      out = { ...f, pallets: n(f.pallets), bultos: n(f.bultos), contenedores: n(f.contenedores), chocolates: n(f.chocolates) };
      mejorCarga = cargaDeFila(f);
      continue;
    }
    out.pallets      = Math.max(out.pallets,      n(f.pallets));
    out.bultos       = Math.max(out.bultos,       n(f.bultos));
    out.contenedores = Math.max(out.contenedores, n(f.contenedores));
    out.chocolates   = Math.max(out.chocolates,   n(f.chocolates));
    const carga = cargaDeFila(f);
    // `>` y no `>=`: ante un empate manda la primera, para que el resultado no dependa del orden
    // en que `fetchCounts` haya devuelto las filas.
    if (carga > mejorCarga) { mejorCarga = carga; out.fuente = f.fuente; }
  }
  return out;
}

/** Anota una fila en la memoria, bajo su tienda y su fuente. */
export function recordarFila(mem: MemoriaSesion, cod: string, row: SesionRow): void {
  let porFuente = mem.get(cod);
  if (!porFuente) { porFuente = new Map(); mem.set(cod, porFuente); }
  porFuente.set(String(row.fuente ?? ''), row);
}

/** La fila combinada de una tienda, o `null` si no hay ninguna. */
export function filaCombinada(mem: MemoriaSesion, cod: string): SesionRow | null {
  const porFuente = mem.get(cod);
  if (!porFuente || porFuente.size === 0) return null;
  return combinarFilas(porFuente.values());
}

/** Todas las tiendas con su fila combinada. Es lo que leen el backlog y el cierre del día. */
export function combinadasPorTienda(mem: MemoriaSesion): Map<string, SesionRow> {
  const out = new Map<string, SesionRow>();
  for (const [cod] of mem) {
    const fila = filaCombinada(mem, cod);
    if (fila) out.set(cod, fila);
  }
  return out;
}
