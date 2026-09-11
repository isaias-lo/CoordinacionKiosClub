// Panel "Manual" de Bodega: cuánto se pesó del día y qué tiendas llevan pallets altos.
// Puro y testeable — no toca red ni base.
//
// Sobre el umbral de "alto": el pedido decía "más alto del promedio o muy cerca". El promedio no
// sirve como aviso: por definición la mitad de los pallets está por encima, así que avisaría de
// la mitad de las tiendas todos los días y se volvería ruido que la gente aprende a ignorar.
//
// Lo que sí es accionable es el límite que ya existe y se enforcea en los inputs de Bodega:
// MAX_ALTO_CM = 185, que sale de los racks y del camión. Un pallet que lo supera es un problema
// real; uno que está en los últimos centímetros "va a llegar alto", que es exactamente lo que se
// quería anticipar. Por eso el aviso se ancla al límite, no al promedio.

import { MAX_ALTO_CM } from './palletLimits';
import { partsOf, lineaTotal, type ManualLine } from './manualText';

/** Desde acá se avisa: los últimos 15 cm antes del límite. */
export const ALTO_AVISO_CM = MAX_ALTO_CM - 15;

/** Lo mínimo que hace falta saber de un slot para estas cuentas. */
export interface SlotPesaje {
  store_cod: string;
  tipo: string;              // P | B | C | CH
  peso_kg: number | null;
  alto: number | null;
  /** Para dejar fuera el bucket "Sin asignar": slots fantasma que nunca se imprimen (P6). */
  picker_label?: string | null;
}

export type NivelAlto = 'ok' | 'cerca' | 'excede';

/**
 * Qué tan alto viene un pallet.
 *
 * `alto` en 0 o ausente es "sin pesar" (DIMS_SIN_PESAR), no un pallet de 0 cm: no se avisa nada,
 * porque todavía no hay medida que juzgar.
 */
export function nivelAlto(alto: number | null | undefined): NivelAlto {
  if (typeof alto !== 'number' || !Number.isFinite(alto) || alto <= 0) return 'ok';
  if (alto > MAX_ALTO_CM) return 'excede';
  return alto >= ALTO_AVISO_CM ? 'cerca' : 'ok';
}

/** Un pallet pesado de verdad siempre tiene peso > 0 — igual criterio que `esSinPesar`. */
const fuePesado = (s: SlotPesaje) => typeof s.peso_kg === 'number' && s.peso_kg > 0;

interface Cuenta { pesados: number; total: number }

export interface ResumenPesaje {
  p: Cuenta;      // pallets
  b: Cuenta;      // bultos
  ch: Cuenta;     // chocolates — aparte: se pesan distinto y se piden en su propia línea
  c: Cuenta;      // contenedores
  todos: Cuenta;
  pct: number;    // % pesado sobre todos los envases, entero
}

const esSinAsignar = (s: SlotPesaje) => (s.picker_label ?? '').trim().toLowerCase() === 'sin asignar';

/**
 * Cuánto se pesó de lo que hay cargado, recortado a las tiendas visibles (la selección de
 * RM / COSTA / REGIONES ya viene aplicada por quien llama).
 *
 * Quedan FUERA las cajas de congelado (CC/CN): Manual es la Bodega de seco, y los congelados tienen
 * su módulo. Antes caían en "bultos" — medido el 11/09/2026 en 26 tiendas: 17 cajas de congelado
 * inflaban los bultos de 90 a 107. Y el bucket "Sin asignar", que son slots que nunca se imprimen.
 */
export function resumenPesaje(slots: SlotPesaje[], codsVisibles: Set<string>): ResumenPesaje {
  const p: Cuenta = { pesados: 0, total: 0 };
  const b: Cuenta = { pesados: 0, total: 0 };
  const ch: Cuenta = { pesados: 0, total: 0 };
  const c: Cuenta = { pesados: 0, total: 0 };
  for (const s of slots) {
    if (!codsVisibles.has(s.store_cod) || esSinAsignar(s)) continue;
    const cuenta = s.tipo === 'P' ? p : s.tipo === 'C' ? c : s.tipo === 'CH' ? ch : s.tipo === 'B' ? b : null;
    if (!cuenta) continue;                                   // CC/CN y cualquier tipo desconocido
    cuenta.total++;
    if (fuePesado(s)) cuenta.pesados++;
  }
  const todos = {
    pesados: p.pesados + b.pesados + ch.pesados + c.pesados,
    total:   p.total + b.total + ch.total + c.total,
  };
  // Sin nada cargado el porcentaje es 0 y no NaN: un "NaN%" en pantalla es peor que un 0.
  const pct = todos.total ? Math.round((todos.pesados / todos.total) * 100) : 0;
  return { p, b, ch, c, todos, pct };
}

const pctDe = (k: Cuenta) => (k.total ? Math.round((k.pesados / k.total) * 100) : 0);

/**
 * Las líneas del pesaje: el total arriba y después UNA LÍNEA POR TIPO, cada una con su fracción y su
 * porcentaje. Un tipo que no tiene ninguno no ocupa línea. Es lo mismo que se ve y lo que se copia.
 */
export function lineasPesaje(r: ResumenPesaje): string[] {
  if (!r.todos.total) return [];
  const porTipo: [string, Cuenta][] = [['Pallets', r.p], ['Bultos', r.b], ['Chocolates', r.ch], ['Contenedores', r.c]];
  return [
    `PESADOS: ${r.todos.pesados} de ${r.todos.total} (${r.pct}%)`,
    ...porTipo.filter(([, k]) => k.total > 0).map(([n, k]) => `${n}: ${k.pesados}/${k.total} (${pctDe(k)}%)`),
  ];
}

/** El bloque de pesaje como texto. Vacío si no hay nada. */
export function textoResumenPesaje(r: ResumenPesaje): string {
  return lineasPesaje(r).join('\n');
}

/** El aviso de una tienda tal como se ve en pantalla: "⚠ 2 altos". */
export function etiquetaAviso(av: { cerca: number; excede: number }): string {
  const n = av.cerca + av.excede;
  return `⚠ ${n} alto${n === 1 ? '' : 's'}`;
}

/**
 * El texto de "Copiar todo": las tiendas CON sus avisos de alto, el TOTAL y el pesaje por tipo.
 *
 * En #463 los avisos quedaban fuera del copiado para que el formato "COD: 2P" siguiera limpio. Se
 * pidió lo contrario: que lo copiado diga lo mismo que la pantalla. Así que se arma con las mismas
 * piezas (partsOf, lineaTotal, etiquetaAviso, lineasPesaje) y no puede diferir de lo que se ve.
 */
export function textoManualParaCopiar(
  lines: ManualLine[],
  tot: { p: number; b: number; c: number; ch: number },
  avisos: Record<string, { cerca: number; excede: number }>,
  resumen: ResumenPesaje,
): string {
  if (!lines.length) return '';
  const tiendas = lines.map(l => {
    const av = avisos[l.cod];
    return `${l.cod}: ${partsOf(l.p, l.b, l.c, l.ch)}${av ? `  ${etiquetaAviso(av)}` : ''}`;
  });
  return [...tiendas, '', lineaTotal(tot, lines.length), ...lineasPesaje(resumen)].join('\n');
}

/**
 * Tiendas con pallets altos, y cuántos. Solo aparecen las que tienen alguno: el aviso vale
 * justamente porque es la excepción.
 *
 * Mira SOLO pallets — el límite de 185 cm es de racks y camión, y no aplica a un bulto ni a un
 * chocolate, que van arriba de un pallet o sueltos.
 */
export function avisosAltoPorTienda(
  slots: SlotPesaje[], codsVisibles: Set<string>,
): Record<string, { cerca: number; excede: number }> {
  const out: Record<string, { cerca: number; excede: number }> = {};
  for (const s of slots) {
    if (s.tipo !== 'P' || !codsVisibles.has(s.store_cod)) continue;
    const nivel = nivelAlto(s.alto);
    if (nivel === 'ok') continue;
    const e = (out[s.store_cod] ??= { cerca: 0, excede: 0 });
    if (nivel === 'excede') e.excede++; else e.cerca++;
  }
  return out;
}
