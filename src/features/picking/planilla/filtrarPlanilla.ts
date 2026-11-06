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
// ── EL TEXTO BUSCA EN TRES CAMPOS ─────────────────────────────────────────────────────────────
//
// Código de tienda, nombre de tienda y **pickers de la fila**. Son las tres preguntas que se
// hacen mirando la hoja —«dónde está la 38SP2», «cuál es Peñalolén», «qué hizo hoy Marcelo»— y un
// solo campo las responde todas, en vez de tres campos que hay que elegir antes de escribir.
//
// Buscar por picker da la fila ENTERA de la tienda, no solo su celda: la pregunta real es «qué
// tiendas tocó Marcelo», y una fila recortada a una columna no se podría comparar con el resto.
//
// ── Y SE COMPARA SIN ACENTOS ──────────────────────────────────────────────────────────────────
//
// Con `flatCode`, la misma regla que ya usa el catálogo para colapsar 23PEN y 23PEÑ. Escribir
// «pen» tiene que encontrar 23PEÑ y «simon» a «Simón Sabathier»: nadie va a buscar la tilde en el
// teclado para filtrar una fila. La lista de tiendas de Picking (`StoreListPanel`) compara en
// mayúsculas pero CON acentos, así que ahí «pen» no encuentra 23PEÑ; acá sí.
//
// ── VACÍO = TODAS ─────────────────────────────────────────────────────────────────────────────
//
// `zonas` vacío significa todas, no ninguna. Es el estado del botón «Todas» y el inicial. La
// alternativa —arrancar con las cinco dentro— obliga a mantener sincronizado «están las cinco»
// con «no hay filtro», y son dos verdades que se desfasan.

import { SECCIONES, totalesDeFilas, type FilaPlanilla, type MovimientoPlanilla, type Planilla }
  from './armarPlanilla';
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

/** Contra qué se compara el texto buscado, para una fila o un movimiento. */
export interface Candidato {
  cod: string;
  /** Falta cuando la tienda no está en el calendario del día. */
  zona?: ZonaPlanilla;
  /** El nombre de la tienda, del catálogo. */
  nombre?: string | null;
  /** Los pickers de esa fila o movimiento: buscar «marcelo» tiene que encontrarlos. */
  pickers?: readonly string[];
}

/**
 * Si un candidato pasa el filtro.
 *
 * El texto se compara contra TRES cosas: el código de la tienda, su nombre y los pickers de la
 * fila. Un solo campo de búsqueda para las tres preguntas que se hacen mirando la hoja —«dónde
 * está tal tienda», «cómo se llama la 23PEÑ», «qué hizo hoy Marcelo»— en vez de tres campos que
 * hay que elegir antes de escribir.
 *
 * `zona` puede faltar: un movimiento de una tienda que no está en el calendario del día no tiene
 * zona resuelta. Con un filtro de zona activo queda fuera —no se puede afirmar que sea de las
 * zonas pedidas—, y con solo texto se juzga por lo que sí tiene.
 */
export function calza(f: FiltroPlanilla, c: Candidato): boolean {
  if (f.zonas.size > 0 && (!c.zona || !f.zonas.has(c.zona))) return false;
  const q = flatCode(f.texto).trim();
  if (!q) return true;
  if (flatCode(c.cod).includes(q)) return true;
  if (flatCode(c.nombre ?? '').includes(q)) return true;
  return (c.pickers ?? []).some(p => flatCode(p).includes(q));
}

/** Los pickers de una fila de la matriz, sin repetir: una persona puede tener varias secciones. */
function pickersDeFila(fila: FilaPlanilla): string[] {
  const out = new Set<string>();
  for (const s of SECCIONES) for (const c of fila.celdas[s]) if (c.picker) out.add(c.picker);
  return [...out];
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
  const filas = p.filas.filter(fila => calza(f, {
    cod: fila.cod, zona: fila.zona, nombre: nombrePorCod?.get(fila.cod),
    pickers: pickersDeFila(fila),
  }));
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
  return movimientos.filter(m => calza(f, {
    cod: m.cod, zona: zonaPorCod.get(m.cod), nombre: nombrePorCod?.get(m.cod),
    pickers: m.picker ? [m.picker] : [],
  }));
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
