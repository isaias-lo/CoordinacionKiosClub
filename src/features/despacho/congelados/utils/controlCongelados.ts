// Las filas de la hoja CONTROL DESPACHO CONG. Puro y testeable.
//
// Es el resumen por tienda del despacho de congelados: una fila por tienda y día, con sus cajas y
// el camión que se la llevó. El equivalente de CONTROL DESPACHO, que es el del seco.
//
// Tres diferencias con el del seco, y las tres importan:
//
//   1. DOS fechas, no una. Congelados se arma un día y sale al día hábil siguiente: lo del viernes
//      sale el lunes. El del seco tiene una sola columna "Fecha" y se entiende como el día de
//      armado — acá eso sería ambiguo justo donde más cuesta caro.
//   2. Cajas CC/CN, no pallets y bultos. Congelados no arma pallets.
//   3. Una sola patente. El seco tiene 1ª y 2ª vuelta; congelados va con flota interna y no da
//      dos vueltas.
//
// El "Día" es el del DESPACHO, no el del armado: es el día en que el camión sale y la tienda
// recibe, que es lo que se mira al revisar la hoja.

export interface TiendaControlCong {
  cod: string;
  cc: number;
  cn: number;
  /** Vacío mientras no se le haya asignado camión. */
  patente?: string;
}

export interface MetaControlCong {
  /** ISO YYYY-MM-DD del día de armado. */
  fechaArmado: string;
  /** ISO YYYY-MM-DD del día de despacho. */
  fechaDespacho: string;
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** El nombre del día de una fecha ISO. En UTC: es una fecha civil, sin hora. */
export function nombreDia(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : DIAS[d.getUTCDay()];
}

/** DD/MM/YYYY, como escribe el resto de la planilla. */
function aDDMM(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso;
}

/**
 * Una fila por tienda. El orden de las columnas es POSICIONAL (A..J) y calza con los encabezados
 * de la hoja — no se reordena nunca, solo se agrega al final.
 *
 * A Fecha Armado · B Fecha Despacho · C Día · D Tienda · E Cajas CC · F Cajas CN
 * G Total Cajas · H Patente · I Cód. normalizado · J Región
 *
 * Las tiendas sin cajas NO se escriben: la hoja es el registro de lo que se despachó, y una fila
 * en cero no es un despacho — es ruido que después hay que filtrar a mano.
 */
export function buildControlCongeladosRows(
  tiendas: TiendaControlCong[],
  meta: MetaControlCong,
  regionDe: (cod: string) => string,
): (string | number)[][] {
  const filas: (string | number)[][] = [];
  const armado   = aDDMM(meta.fechaArmado);
  const despacho = aDDMM(meta.fechaDespacho);
  const dia      = nombreDia(meta.fechaDespacho);

  for (const t of tiendas) {
    const cod = String(t.cod ?? '').trim().toUpperCase();
    const cc  = t.cc ?? 0;
    const cn  = t.cn ?? 0;
    if (!cod || cc + cn === 0) continue;
    filas.push([armado, despacho, dia, cod, cc, cn, cc + cn, t.patente ?? '', cod, regionDe(cod)]);
  }

  return filas;
}

/** Clave de una fila para el upsert: una tienda aparece una vez por día de despacho. */
export function claveControlCong(fechaDespachoDDMM: string, cod: string): string {
  return `${fechaDespachoDDMM}::${String(cod ?? '').trim().toUpperCase()}`;
}
