// Unidades que Picking ya etiquetó pero que Bodega todavía no guardó. Puro y testeable.
//
// Existe por el 2026-09-11: 13PIE salió con 3 bultos y 22LGN con 2 que estaban impresos en Picking
// y nunca se guardaron en Bodega. Las dos tiendas se marcaron "Terminada" igual, y lo que el Manual
// y el Enrutador leen es el conteo de Bodega (despacho_sesion) — así que esa carga no existía para
// el camión. En Bodega esas unidades se ven como tarjetas "sin guardar", fáciles de pasar por alto
// al final del día.
//
// Congelados queda fuera: tiene su propio módulo y las bodegas de seco no deben contar esas cajas.

import { esCongeladoContenido } from './congeladosBodega';

export interface SlotDePicking {
  id: number;
  tipo?: string | null;
  contenido?: string | null;
}

export type TipoUnidad = 'P' | 'B' | 'C' | 'CH';
export type ConteoSinGuardar = Record<TipoUnidad, number> & { total: number };

const NOMBRE: Record<TipoUnidad, [string, string]> = {
  P:  ['pallet', 'pallets'],
  B:  ['bulto', 'bultos'],
  C:  ['contenedor', 'contenedores'],
  CH: ['chocolate', 'chocolates'],
};

const TIPOS = Object.keys(NOMBRE) as TipoUnidad[];

/** Cuántas unidades de Picking de esta tienda no tienen ítem guardado en Bodega, por tipo. */
export function unidadesSinGuardar(
  slots: SlotDePicking[],
  items: { pickingSlotId?: number }[],
): ConteoSinGuardar {
  const guardados = new Set(items.map(i => i.pickingSlotId).filter((x): x is number => x != null));
  const out: ConteoSinGuardar = { P: 0, B: 0, C: 0, CH: 0, total: 0 };
  for (const s of slots) {
    if (guardados.has(s.id) || esCongeladoContenido(s.contenido)) continue;
    const tipo = (s.tipo ?? 'P').toUpperCase() as TipoUnidad;
    if (!TIPOS.includes(tipo)) continue;
    out[tipo] += 1;
    out.total += 1;
  }
  return out;
}

/** El aviso para el momento de marcar la tienda terminada. `null` si no falta ninguna. */
export function avisoSinGuardar(conteo: ConteoSinGuardar): string | null {
  if (conteo.total === 0) return null;
  const partes = TIPOS
    .filter(t => conteo[t] > 0)
    .map(t => `${conteo[t]} ${NOMBRE[t][conteo[t] === 1 ? 0 : 1]}`);
  const lista = partes.length > 1
    ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
    : partes[0];
  return `⚠ ${lista} de Picking sin guardar en Bodega (quedaron como tarjetas sin guardar). Esa carga no la ve el Enrutador.`;
}
