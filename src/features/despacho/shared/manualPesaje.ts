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

/** Desde acá se avisa: los últimos 15 cm antes del límite. */
export const ALTO_AVISO_CM = MAX_ALTO_CM - 15;

/** Lo mínimo que hace falta saber de un slot para estas cuentas. */
export interface SlotPesaje {
  store_cod: string;
  tipo: string;              // P | B | C | CH
  peso_kg: number | null;
  alto: number | null;
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
  b: Cuenta;      // bultos — el chocolate cuenta acá, igual que en la línea TOTAL
  c: Cuenta;      // contenedores
  todos: Cuenta;
  pct: number;    // % pesado sobre todos los envases, entero
}

/**
 * Cuánto se pesó de lo que hay cargado, recortado a las tiendas visibles (la selección de
 * RM / COSTA / REGIONES ya viene aplicada por quien llama).
 */
export function resumenPesaje(slots: SlotPesaje[], codsVisibles: Set<string>): ResumenPesaje {
  const p: Cuenta = { pesados: 0, total: 0 };
  const b: Cuenta = { pesados: 0, total: 0 };
  const c: Cuenta = { pesados: 0, total: 0 };
  for (const s of slots) {
    if (!codsVisibles.has(s.store_cod)) continue;
    const cuenta = s.tipo === 'P' ? p : s.tipo === 'C' ? c : b;   // B y CH van juntos
    cuenta.total++;
    if (fuePesado(s)) cuenta.pesados++;
  }
  const todos = {
    pesados: p.pesados + b.pesados + c.pesados,
    total:   p.total + b.total + c.total,
  };
  // Sin nada cargado el porcentaje es 0 y no NaN: un "NaN%" en pantalla es peor que un 0.
  const pct = todos.total ? Math.round((todos.pesados / todos.total) * 100) : 0;
  return { p, b, c, todos, pct };
}

/** Línea de texto del resumen, para mostrar y para el botón copiar. Vacío si no hay nada. */
export function textoResumenPesaje(r: ResumenPesaje): string {
  if (!r.todos.total) return '';
  const detalle = [
    r.p.total && `${r.p.pesados}/${r.p.total} P`,
    r.b.total && `${r.b.pesados}/${r.b.total} B`,
    r.c.total && `${r.c.pesados}/${r.c.total} C`,
  ].filter(Boolean).join(' · ');
  return `PESADOS: ${r.todos.pesados} de ${r.todos.total} (${r.pct}%)${detalle ? ` · ${detalle}` : ''}`;
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
