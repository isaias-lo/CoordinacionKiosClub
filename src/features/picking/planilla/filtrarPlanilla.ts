// El buscador y el filtro de zonas de la planilla. Módulo puro: sin red ni UI.
//
// ── POR QUÉ FILTRA DESPUÉS DE ARMAR, Y NO ANTES ───────────────────────────────────────────────
//
// Lo directo sería sacarle tiendas a la lista que recibe `armarPlanilla`. Pero esa función cuenta
// como `fueraDelCalendario` todo movimiento cuya tienda no está en la lista: filtrando antes, las
// 23 tiendas escondidas aparecerían como «fuera del calendario» en el pie, que es el contador que
// avisa de un problema real. Filtrar la planilla ya armada deja ese diagnóstico intacto.
//
// Por lo mismo, `descartados` y `fueraDelCalendario` NO se recalculan: son del día entero, no de
// lo que se está mirando. Los totales sí, porque están al pie de las columnas que se ven y un
// total que no suma lo que está arriba es un número que nadie puede verificar.
//
// ── EL TEXTO SE COMPARA SIN ACENTOS ───────────────────────────────────────────────────────────
//
// Con `flatCode`, la misma regla que ya usa el catálogo para colapsar 23PEN y 23PEÑ. Escribir
// «pen» tiene que encontrar 23PEÑ: nadie va a buscar la Ñ en el teclado para filtrar una fila.
// La lista de tiendas de Picking (`StoreListPanel`) compara en mayúsculas pero CON acentos, así
// que ahí «pen» no encuentra 23PEÑ; acá sí.
//
// ── VACÍO = TODAS ─────────────────────────────────────────────────────────────────────────────
//
// `zonas` vacío significa todas, no ninguna. Es el estado del botón «Todas» y el inicial. La
// alternativa —arrancar con las cinco dentro— obliga a mantener sincronizado «están las cinco»
// con «no hay filtro», y son dos verdades que se desfasan.

import { SECCIONES, totalesDeFilas, type MovimientoPlanilla, type Planilla } from './armarPlanilla';
import { COLOR_ZONA, ZONAS, type ZonaPlanilla } from './zonaPlanilla';
import { flatCode } from '../picking-utils';

export interface FiltroPlanilla {
  /** Lo escrito en el buscador. Calza contra el código y el nombre de la tienda. */
  texto: string;
  /** Las zonas elegidas. **Vacío = todas.** */
  zonas: ReadonlySet<ZonaPlanilla>;
}

/** El estado inicial: la hoja completa del día. */
export const FILTRO_VACIO: FiltroPlanilla = { texto: '', zonas: new Set() };

/** `true` si no hay nada filtrando y la hoja es la del día entero. */
export function sinFiltro(f: FiltroPlanilla): boolean {
  return f.texto.trim() === '' && f.zonas.size === 0;
}

/**
 * Si una tienda pasa el filtro.
 *
 * `zona` puede faltar: un movimiento de una tienda que no está en el calendario del día no tiene
 * zona resuelta. Con un filtro de zona activo queda fuera —no se puede afirmar que sea de las
 * zonas pedidas—, y con solo texto se juzga por su código, que es el dato que sí tiene.
 */
export function calza(
  f: FiltroPlanilla,
  cod: string,
  zona: ZonaPlanilla | undefined,
  nombre?: string | null,
): boolean {
  if (f.zonas.size > 0 && (!zona || !f.zonas.has(zona))) return false;
  const q = flatCode(f.texto).trim();
  if (!q) return true;
  return flatCode(cod).includes(q) || flatCode(nombre ?? '').includes(q);
}

/**
 * La planilla con solo las filas que pasan el filtro, y los totales recalculados.
 *
 * Sin filtro devuelve **el mismo objeto**, no una copia: la pantalla lo pasa por `useMemo` y una
 * copia nueva en cada render volvería a dibujar la tabla entera sin que nada haya cambiado.
 *
 * `nombrePorCod` es opcional: sin él se busca solo por código. La hoja lo tiene porque ya trae el
 * catálogo para resolver la zona.
 */
export function filtrarPlanilla(
  p: Planilla,
  f: FiltroPlanilla,
  nombrePorCod?: ReadonlyMap<string, string>,
): Planilla {
  if (sinFiltro(f)) return p;
  const filas = p.filas.filter(fila => calza(f, fila.cod, fila.zona, nombrePorCod?.get(fila.cod)));
  return { ...p, filas, totales: totalesDeFilas(filas) };
}

/** Los movimientos de la vista Detalle que pasan el filtro. Misma regla, otra forma de dato. */
export function filtrarMovimientos(
  movimientos: MovimientoPlanilla[],
  f: FiltroPlanilla,
  zonaPorCod: ReadonlyMap<string, ZonaPlanilla>,
  nombrePorCod?: ReadonlyMap<string, string>,
): MovimientoPlanilla[] {
  if (sinFiltro(f)) return movimientos;
  return movimientos.filter(m => calza(f, m.cod, zonaPorCod.get(m.cod), nombrePorCod?.get(m.cod)));
}

/**
 * El filtro en palabras, para la hoja impresa y el nombre del archivo.
 *
 * Una hoja impresa a la que le faltan tiendas y no lo dice es una hoja que se firma como si fuera
 * el día completo. Por eso esto no es decorativo: va en la cabecera del papel.
 *
 * Las zonas salen en el orden de `ZONAS` y no en el que se tocaron los botones: un `Set` conserva
 * el orden de inserción, así que sin esto el mismo filtro se describiría distinto según en qué
 * orden se hizo clic.
 */
export function describirFiltro(f: FiltroPlanilla): string {
  const partes: string[] = [];
  if (f.zonas.size > 0) {
    partes.push(ZONAS.filter(z => f.zonas.has(z)).map(z => COLOR_ZONA[z].label).join(' + '));
  }
  const q = f.texto.trim();
  if (q) partes.push(`«${q}»`);
  return partes.join(' · ');
}

/** Cuántas tiendas hay por zona en la hoja COMPLETA: es el número de las pastillas. */
export function contarPorZona(p: Planilla): Record<ZonaPlanilla, number> {
  const n: Record<ZonaPlanilla, number> = { norte: 0, sur: 0, costa: 0, mall: 0, rm: 0 };
  for (const f of p.filas) n[f.zona]++;
  return n;
}

/** Cuántos registros suma la hoja filtrada, para decir en pantalla qué parte del día se ve. */
export function sumaRegistros(p: Planilla): number {
  return SECCIONES.reduce((a, s) => a + p.totales[s], 0);
}
