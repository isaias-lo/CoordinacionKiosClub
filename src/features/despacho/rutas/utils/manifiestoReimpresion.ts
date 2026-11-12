import type { TiendaManifiesto } from './manifiestoTienda';

/**
 * [Reimprimir manifiestos · 10/11/2026] Volver a ver e imprimir el manifiesto de un camión YA
 * cerrado, tal cual quedó guardado.
 *
 * Antes, la única forma de reabrir un manifiesto era reconstruir la RUTA desde las tiendas
 * guardadas (`reconstruirAsignaciones` → `rutasDesdeAsignaciones`) y pasarla por el mismo panel que
 * los arma al cerrar. Eso tenía tres problemas para reimprimir:
 *
 *  · Re-ordenaba las paradas con el motor (el orden guardado en `ruta_tiendas.orden` se perdía).
 *  · Tomaba el chofer de la flota de HOY, no el que quedó en el manifiesto.
 *  · Juntaba por patente: un camión con 1ª y 2ª vuelta el mismo día salía como un solo manifiesto.
 *
 * Acá se arma el documento directo desde la fila guardada, uno por fila de `rutas_despacho`, con
 * su código y su QR reales. Una reimpresión con otro código o QR sería otro documento.
 */

export interface ManifiestoData {
  idx: number;
  id?: number;
  codigo_ruta: string;
  fecha: string;
  chofer: string;
  patente: string;
  transporte: string;
  bodega_origen: string;
  estado: string;
  token_qr?: string;
  tiendas: TiendaManifiesto[];
  total_pallets: number;
  total_bultos: number;
  total_chocolates: number;
  /** 'HH:MM' — solo si su primera tienda abre después de que el camión llegaría. Se muestra; no se guarda. */
  salida_sugerida?: string;
  /** Día en que la carga llega a la tienda. Distinto del de armado; ver utils/fechaSalida. */
  fecha_salida?: string | null;
  /** [2ª vuelta] Día cuya carga lleva, si no es la de `fecha`. Ver shared/cargaEnCamion.ts. */
  fecha_origen?: string | null;
  /** [Panel Conductor] 'seco' | 'congelado' — decide qué fotos pide el chofer por parada. Se
   *  toma del vehículo al cerrar, se graba en la ruta (no se re-deriva cada vez: un camión
   *  refrigerado puede llevar carga seca ese día). */
  tipo: 'seco' | 'congelado';
}

/** Lo que devuelve GET /api/rutas-despacho por cada manifiesto (solo lo que se usa acá). */
export interface ManifiestoGuardadoCompleto {
  id: number;
  fecha: string;
  fecha_salida?: string | null;
  codigo_ruta: string;
  chofer?: string | null;
  patente: string;
  bodega_origen?: string | null;
  estado?: string | null;
  token_qr?: string | null;
  tipo?: string | null;
  created_at?: string | null;
  ruta_tiendas?: {
    store_cod: string;
    nombre?: string | null;
    ventana?: string | null;
    orden?: number | null;
    pallets?: number | null;
    bultos?: number | null;
    contenedores?: number | null;
  }[] | null;
}

export interface DatosTienda { n?: string; v?: string; vCong?: string; observacion?: string }

export interface ContextoReimpresion {
  /** Catálogo de tiendas, para el nombre/ventana si la fila guardada no los trae, y la observación
   *  (que `ruta_tiendas` no guarda). */
  tienda: (cod: string) => DatosTienda | undefined;
  /** Empresa del camión: `rutas_despacho` no la guarda, se toma de la flota por patente. */
  transporte: (patente: string) => string | undefined;
  /** Chocolates por tienda del día de ARMADO. `ruta_tiendas` no tiene la columna, así que se leen
   *  de lo registrado en Bodega (`despacho_sesion`), que es de donde salen los conteos (CLAUDE.md:
   *  «Los conteos salen de lo GUARDADO en Bodega»). Clave: `${fecha}|${COD}`. */
  chocolates?: Map<string, number>;
}

const n0 = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const up = (s: string | null | undefined) => String(s ?? '').trim().toUpperCase();

export const claveChocolates = (fecha: string, cod: string) => `${fecha}|${up(cod)}`;

/** Suma los chocolates registrados en Bodega por (día, tienda), sumando las bodegas (santiago/regiones). */
export function chocolatesPorTienda(filas: { fecha: string; tienda_cod: string; chocolates?: number | null }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of filas) {
    if (!f?.tienda_cod) continue;
    const k = claveChocolates(f.fecha, f.tienda_cod);
    out.set(k, (out.get(k) ?? 0) + n0(f.chocolates));
  }
  return out;
}

/** Arma el documento de UN manifiesto guardado, sin regenerar nada de lo que ya circuló. */
export function manifiestoDesdeGuardado(g: ManifiestoGuardadoCompleto, idx: number, ctx: ContextoReimpresion): ManifiestoData {
  const tipo: 'seco' | 'congelado' = g.tipo === 'congelado' ? 'congelado' : 'seco';
  const filas = [...(g.ruta_tiendas ?? [])].filter(t => t?.store_cod)
    .sort((a, b) => n0(a.orden) - n0(b.orden));
  const tiendas: TiendaManifiesto[] = filas.map((t, i) => {
    const info = ctx.tienda(t.store_cod) ?? ctx.tienda(up(t.store_cod));
    const ventanaCatalogo = tipo === 'congelado' ? (info?.vCong || info?.v) : info?.v;
    // El congelado no lleva chocolates: el chocolate va en el seco.
    const chocolates = tipo === 'seco' ? (ctx.chocolates?.get(claveChocolates(g.fecha, t.store_cod)) ?? 0) : 0;
    return {
      store_cod:    t.store_cod,
      nombre:       t.nombre || info?.n || t.store_cod,
      ventana:      t.ventana || ventanaCatalogo || '—',
      observacion:  info?.observacion,
      orden:        n0(t.orden) || i + 1,
      pallets:      n0(t.pallets),
      bultos:       n0(t.bultos),
      chocolates,
      contenedores: n0(t.contenedores),
    };
  });
  return {
    idx,
    id:            g.id,
    codigo_ruta:   g.codigo_ruta,
    fecha:         g.fecha,
    fecha_salida:  g.fecha_salida ?? null,
    chofer:        (g.chofer ?? '').trim() || 'Sin asignar',
    patente:       g.patente,
    transporte:    ctx.transporte(g.patente) || 'Luis Fica',
    bodega_origen: g.bodega_origen || 'Santiago',
    estado:        g.estado || 'pendiente',
    token_qr:      g.token_qr ?? undefined,
    tipo,
    tiendas,
    total_pallets:    tiendas.reduce((s, t) => s + t.pallets, 0),
    total_bultos:     tiendas.reduce((s, t) => s + t.bultos, 0),
    total_chocolates: tiendas.reduce((s, t) => s + t.chocolates, 0),
  };
}

/** Lo que muestra la lista para elegir qué reimprimir. */
export interface FilaReimpresion {
  id: number;
  codigo_ruta: string;
  patente: string;
  chofer: string;
  tipo: 'seco' | 'congelado';
  fecha: string;
  fecha_salida: string | null;
  tiendas: number;
  pallets: number;
  bultos: number;
  estado: string;
}

/** Una fila por manifiesto guardado, en el orden en que se cerraron. Descarta filas sin id/patente. */
export function filasReimpresion(guardados: ManifiestoGuardadoCompleto[] | null | undefined): FilaReimpresion[] {
  return [...(guardados ?? [])]
    .filter(g => g && g.id != null && up(g.patente))
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || a.id - b.id)
    .map(g => {
      const ts = g.ruta_tiendas ?? [];
      return {
        id: g.id,
        codigo_ruta: g.codigo_ruta,
        patente: g.patente,
        chofer: (g.chofer ?? '').trim() || 'Sin asignar',
        tipo: g.tipo === 'congelado' ? 'congelado' : 'seco',
        fecha: g.fecha,
        fecha_salida: g.fecha_salida ?? null,
        tiendas: ts.length,
        pallets: ts.reduce((s, t) => s + n0(t.pallets), 0),
        bultos: ts.reduce((s, t) => s + n0(t.bultos), 0),
        estado: g.estado || 'pendiente',
      };
    });
}

/** Ids de los manifiestos de una patente (todas sus vueltas), para abrir directo desde «ver manifiesto». */
export function idsDePatente(guardados: ManifiestoGuardadoCompleto[] | null | undefined, patente: string): number[] {
  const p = up(patente);
  return filasReimpresion(guardados).filter(f => up(f.patente) === p).map(f => f.id);
}
