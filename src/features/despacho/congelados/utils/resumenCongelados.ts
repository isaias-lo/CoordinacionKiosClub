// Qué mostrar primero en la grilla de Congelados, y qué falta por registrar. Puro y testeable.
//
// Existe por M-05 y M-06, y por algo que apareció al revisar el flujo completo: la grilla mostraba
// 18 tarjetas iguales donde 15 decían "0 cajas", con las tres que sí tenían carga repartidas al
// azar. No había total, ni fecha, ni —lo más importante— ninguna señal de que esa carga todavía no
// estaba REGISTRADA. Registrar es lo que la manda al despacho y al Enrutador: sin ese paso, las
// cajas existen en Picking y para nadie más.

export interface ConteoTienda { total: number }

export interface ResumenCongelados {
  /** Tiendas con cajas, las PENDIENTES de registrar primero. */
  conCarga: string[];
  /** Tiendas del día sin cajas — van colapsadas. */
  sinCarga: string[];
  totalCajas: number;
  /** Cuántas tiendas con carga están sin registrar: el número que hay que mirar. */
  pendientes: number;
}

export function resumenCongelados(
  cods: string[],
  cajasPorTienda: Record<string, ConteoTienda | undefined>,
  registradas: ReadonlySet<string>,
): ResumenCongelados {
  const conCarga: string[] = [];
  const sinCarga: string[] = [];
  let totalCajas = 0;

  for (const cod of cods) {
    const n = cajasPorTienda[cod]?.total ?? 0;
    totalCajas += n;
    (n > 0 ? conCarga : sinCarga).push(cod);
  }

  // Dentro de las que tienen carga: primero lo que falta registrar. Lo ya registrado no necesita
  // atención, así que baja — pero no desaparece, porque sirve para confirmar que se hizo.
  const pendientesLista = conCarga.filter(c => !registradas.has(c));
  const listas          = conCarga.filter(c =>  registradas.has(c));

  return {
    conCarga: [...pendientesLista, ...listas],
    sinCarga,
    totalCajas,
    pendientes: pendientesLista.length,
  };
}

/** "19 cajas · 3 tiendas". Vacío si no hay nada. */
export function textoTotalCongelados(r: ResumenCongelados): string {
  if (r.totalCajas === 0) return '';
  const cajas = `${r.totalCajas} ${r.totalCajas === 1 ? 'caja' : 'cajas'}`;
  const tiendas = `${r.conCarga.length} ${r.conCarga.length === 1 ? 'tienda' : 'tiendas'}`;
  return `${cajas} · ${tiendas}`;
}

/** "15 tiendas sin congelados". Vacío si no hay ninguna. */
export function textoSinCarga(r: ResumenCongelados): string {
  const n = r.sinCarga.length;
  if (n === 0) return '';
  return `${n} tienda${n === 1 ? '' : 's'} sin congelados`;
}
