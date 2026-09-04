// Qué se cerró, contado en el momento de cerrar.
//
// Terminar el día es la acción MÁS irreversible del Enrutador: emite manifiestos, genera los QR y
// escribe el registro. Y no devolvía nada — la pantalla volvía al tablero igual que antes.
//
// El costo no es de comodidad. El 03/09 cuatro tiendas quedaron en el manifiesto pero fuera de la
// copia de la base, y eso se descubrió al día siguiente. Con un resumen al cerrar se habría visto
// en el momento, con los camiones todavía en el patio.
//
// Puro y testeable: recibe lo que hay en pantalla y devuelve qué decir.

export interface CamionCerrado { patente: string; tiendas: string[] }

export interface ResumenCierre {
  fecha: string;
  camiones: number;
  tiendas: number;
  /** Tiendas con carga que NO quedaron en ningún camión: nadie las va a llevar. */
  sinCamion: string[];
  /** Tiendas que van en un camión pero que Bodega nunca registró: salen sin datos. */
  sinDatosDeBodega: string[];
  /** `true` si algo quedó a medias y merece que el usuario lo mire antes de irse. */
  hayAvisos: boolean;
}

/**
 * Arma el resumen de lo que se acaba de cerrar.
 *
 * `enElPool` son las tiendas con carga del día; `asignaciones` el tablero; `conDatosDeBodega` los
 * códigos que Bodega ya registró. Todo se compara por código, sin tocar red ni estado.
 */
export function resumenCierre(
  fecha: string,
  enElPool: string[],
  asignaciones: Record<string, { c: string }[]>,
  conDatosDeBodega: Iterable<string> = [],
): ResumenCierre {
  const conCamion = new Map<string, string>();   // tienda → patente
  let camiones = 0;
  for (const [patente, tiendas] of Object.entries(asignaciones)) {
    const lista = (tiendas ?? []).filter(t => t?.c);
    if (!lista.length) continue;                  // patentes vacías no son camiones
    camiones++;
    for (const t of lista) conCamion.set(t.c, patente);
  }

  const conDatos = new Set(conDatosDeBodega);
  const sinCamion    = enElPool.filter(c => !conCamion.has(c)).sort();
  const sinDatosDeBodega = [...conCamion.keys()].filter(c => !conDatos.has(c)).sort();

  return {
    fecha,
    camiones,
    tiendas: conCamion.size,
    sinCamion,
    sinDatosDeBodega,
    hayAvisos: sinCamion.length > 0 || sinDatosDeBodega.length > 0,
  };
}

/** El resumen en una línea, para mostrarlo apenas se cierra. */
export function textoResumenCierre(r: ResumenCierre): string {
  const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
  const partes = [`${plural(r.camiones, 'manifiesto', 'manifiestos')} · ${plural(r.tiendas, 'tienda', 'tiendas')}`];
  if (r.sinCamion.length)    partes.push(`⚠ sin camión: ${r.sinCamion.join(', ')}`);
  if (r.sinDatosDeBodega.length) partes.push(`⚠ sin datos de Bodega: ${r.sinDatosDeBodega.join(', ')}`);
  return `Día cerrado · ${partes.join(' · ')}`;
}
