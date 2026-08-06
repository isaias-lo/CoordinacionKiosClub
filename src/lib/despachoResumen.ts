// Agregación diaria del despacho REAL (despacho_rm + despacho_regiones) para el gráfico del home.
//
// El gráfico usaba los totales guardados en `historial_despacho`, que subcuentan (solo cuentan lo
// ruteado al momento de guardar) y se fragmentan (varias filas por día). Aquí se cuenta la verdad
// del registro: una fila por pallet/bulto/chocolate/contenedor. Puro y testeable.

export type CategoriaDespacho = 'pallets' | 'bultos' | 'contenedores' | 'chocolates';

export interface ResumenDia {
  fecha: string; // DD/MM/YYYY (como en despacho_rm/regiones)
  pallets: number; bultos: number; contenedores: number; chocolates: number;
}

/** Mapea el `tipo` de una fila (Pallet / Bulto / Bulto CH / Chocolate / Contenedor) a su categoría. */
export function categoriaDeTipo(tipo: string): CategoriaDespacho {
  const t = String(tipo ?? '').trim().toUpperCase();
  if (t === 'PALLET')      return 'pallets';
  if (t === 'CONTENEDOR')  return 'contenedores';
  if (t === 'CHOCOLATE' || t.includes('CH')) return 'chocolates'; // 'Bulto CH' y 'Chocolate'
  return 'bultos';
}

/** Agrupa filas {fecha, tipo} por fecha, contando por categoría. Puro. */
export function agruparResumenDiario(rows: { fecha: string; tipo: string }[]): ResumenDia[] {
  const map = new Map<string, ResumenDia>();
  for (const r of rows) {
    const fecha = String(r.fecha ?? '').trim();
    if (!fecha) continue;
    let d = map.get(fecha);
    if (!d) { d = { fecha, pallets: 0, bultos: 0, contenedores: 0, chocolates: 0 }; map.set(fecha, d); }
    d[categoriaDeTipo(r.tipo)]++;
  }
  return [...map.values()];
}

/** Convierte DD/MM/YYYY (o ISO YYYY-MM-DD) a ISO YYYY-MM-DD para ordenar/formatear. '' si no parsea. */
export function fechaAISO(fecha: string): string {
  const s = String(fecha ?? '').trim();
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

/**
 * Ordena el resumen por fecha descendente (más reciente primero) y lo limita a `n` días con
 * actividad (>0). Devuelve cada día con su `fechaISO` para el gráfico. Puro.
 */
export function resumenParaGrafico(dias: ResumenDia[], n = 7): (ResumenDia & { fechaISO: string })[] {
  return dias
    .map(d => ({ ...d, fechaISO: fechaAISO(d.fecha) }))
    .filter(d => d.fechaISO && (d.pallets + d.bultos + d.contenedores + d.chocolates) > 0)
    .sort((a, b) => (a.fechaISO < b.fechaISO ? 1 : a.fechaISO > b.fechaISO ? -1 : 0))
    .slice(0, n);
}
