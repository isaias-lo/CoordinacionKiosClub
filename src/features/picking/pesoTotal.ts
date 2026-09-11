// Peso TOTAL de las cajas de un encargado, repartido entre ellas. Puro y testeable.
//
// Hasta ahora el chocolate se pesaba por caja ("Peso por chocolate", #458) y las cajas de congelado
// no se pesaban. En el andén lo natural es otra cosa: se suben todas las cajas juntas a la balanza.
// Este módulo toma ese total y lo reparte, de forma que la SUMA dé exacto lo que marcó la balanza —
// que es lo que importa aguas abajo: el peso de lo que sale en el camión, no el de cada caja suelta.

import { CHOCOLATE_PESO_MAX } from '@/features/despacho/shared/chocolate';

export type TipoCaja = 'CH' | 'CC' | 'CN';

/**
 * Tope por caja, para atajar un error de tipeo o una caja que falta contar. Para el chocolate es el
 * de siempre (25 kg). Para las de congelado no hay un máximo de negocio conocido: es un tope de
 * cordura — nadie carga una caja de 60 kg a mano.
 */
const TOPE_POR_CAJA: Record<TipoCaja, number> = { CH: CHOCOLATE_PESO_MAX, CC: 60, CN: 60 };

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/**
 * Reparte `total` kg entre `n` cajas, a 0,1 kg. La suma da EXACTO el total: el redondeo lo absorben
 * las últimas cajas (una décima cada una), no se pierde ni se inventa peso. Sin cajas o sin peso,
 * no hay nada que repartir.
 */
export function repartirPeso(total: number, n: number): number[] {
  if (!(n > 0) || !(total > 0)) return [];
  const decimas = Math.round(total * 10);
  const base = Math.floor(decimas / n);
  const resto = decimas - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i >= n - resto ? 1 : 0)) / 10);
}

export type ResultadoPesoTotal =
  | { ok: true; total: number; porCaja: number }
  | { ok: false; error: string };

/** Valida lo que se escribió. Acepta coma decimal, que es lo que escribe un teclado en español. */
export function pesoTotalValido(raw: string, n: number, tipo: TipoCaja): ResultadoPesoTotal {
  if (!(n > 0)) return { ok: false, error: 'Todavía no hay cajas de este tipo: agrégalas antes de pesar.' };
  const txt = String(raw ?? '').trim().replace(',', '.');
  const total = /^\d+(\.\d+)?$/.test(txt) ? Number(txt) : NaN;
  if (!Number.isFinite(total) || total <= 0) return { ok: false, error: 'Escribe el peso total en kg (ej. 180,5).' };
  const porCaja = Math.round((total / n) * 100) / 100;
  if (total * 10 < n) return { ok: false, error: 'Da menos de 0,1 kg por caja. ¿Escribiste el peso correcto?' };
  const tope = TOPE_POR_CAJA[tipo];
  if (porCaja > tope) {
    return { ok: false, error: `Da ${fmt(porCaja)} kg por caja, más que el máximo de ${tope}. ¿Falta contar cajas o sobra un cero?` };
  }
  return { ok: true, total, porCaja };
}

export interface PesoTotalGuardado { total: number; n: number }

/** Se guarda el total JUNTO con cuántas cajas había al pesar: si la cantidad cambia, se nota. */
export function serializarPesoTotal(p: PesoTotalGuardado): string {
  return JSON.stringify({ total: p.total, n: p.n });
}

/** Un valor roto o vacío se lee como "sin total": nunca rompe la tarjeta. */
export function leerPesoTotal(s: string | null | undefined): PesoTotalGuardado | null {
  if (!s) return null;
  try {
    const o = JSON.parse(s) as { total?: unknown; n?: unknown };
    return typeof o.total === 'number' && o.total > 0 && typeof o.n === 'number' && o.n > 0
      ? { total: o.total, n: o.n } : null;
  } catch {
    return null;
  }
}

/**
 * Si después de pesar se agregó o se quitó una caja, el total ya no corresponde. NO se reparte de
 * nuevo a ciegas: el peso de una caja nueva no se sabe, y repartir el mismo total entre más cajas
 * sería inventar. Se pide volver a pesar.
 */
export function avisoCantidad(guardado: PesoTotalGuardado | null, nActual: number): string | null {
  if (!guardado || guardado.n === nActual) return null;
  return `El total de ${fmt(guardado.total)} kg era para ${guardado.n} cajas y ahora hay ${nActual}. Vuelve a pesar y escribe el total.`;
}
