import type { CalRecord } from '@/lib/calendarioCongeladosSync';
import { esCongeladoContenido } from '@/features/despacho/shared/congeladosBodega';

// Mismo indexado que useCalendario.ts: getTiendasDelDia — new Date().getDay() (0=Domingo).
const DAY_CODES = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];

/**
 * Deriva las tiendas del día (hoy por defecto) desde un CalRecord del calendario de
 * Congelados. Espeja getTiendasDelDia (useCalendario.ts) pero es pura: recibe el
 * CalRecord ya cargado en vez de hacer fetch.
 */
export function tiendasCongeladosDelDia(
  cal: CalRecord,
  grupo: 'rm' | 'costa' | 'fal' | 'all' = 'all',
  hoy: Date = new Date()
): string[] {
  const dia = DAY_CODES[hoy.getDay()];
  const datosDia = cal[dia];
  if (!datosDia) return [];

  const codigos = grupo === 'all'
    ? datosDia.rm.concat(datosDia.costa, datosDia.fal)
    : datosDia[grupo];

  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const cod of codigos) {
    if (!cod) continue;
    if (vistos.has(cod)) continue;
    vistos.add(cod);
    resultado.push(cod);
  }
  return resultado;
}

export interface ConteoCajas {
  total: number;
  cc: number;
  cn: number;
}

/**
 * Cuenta las cajas de congelados (CC = Caja Cartón, CN = Caja Negra) dentro de una
 * lista de slots de picking. Solo considera slots cuyo contenido es congelados
 * (esCongeladoContenido) — ignora seco (hogar/comida/etc).
 */
export function contarCajasCongelados(
  slots: Array<{ tipo: string; contenido: string }>
): ConteoCajas {
  const congelados = slots.filter((s) => esCongeladoContenido(s.contenido));
  const cc = congelados.filter((s) => s.tipo === 'CC').length;
  const cn = congelados.filter((s) => s.tipo === 'CN').length;
  return { total: congelados.length, cc, cn };
}

/**
 * Aplica contarCajasCongelados por tienda. Omite tiendas sin cajas de congelados
 * (total === 0) para que el resultado solo liste las tiendas relevantes.
 */
export function cajasCongeladosPorTienda(
  slotsPorTienda: Record<string, Array<{ tipo: string; contenido: string }>>
): Record<string, ConteoCajas> {
  const resultado: Record<string, ConteoCajas> = {};
  for (const [tienda, slots] of Object.entries(slotsPorTienda)) {
    const conteo = contarCajasCongelados(slots);
    if (conteo.total === 0) continue;
    resultado[tienda] = conteo;
  }
  return resultado;
}
