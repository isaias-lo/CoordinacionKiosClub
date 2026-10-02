// Arma el CRUCE PESOS de un día entero, en el servidor.
//
// ── POR QUÉ EN EL SERVIDOR ─────────────────────────────────────────────────────────────────────
//
// El cruce necesita los pesos de LOS DOS espejos de Bodega, y ningún cliente los tiene: RM/Costa
// conoce lo suyo y Nacional lo suyo. Si esto se armara en el navegador, la tienda registrada por
// el otro espejo saldría sin peso — que es exactamente el hueco que el coordinador vio al apretar
// REGISTRAR y no ver nada.
//
// ── POR QUÉ UNA CONSULTA PROPIA A ODOO ─────────────────────────────────────────────────────────
//
// `getDayPickings` —la consulta diaria cacheada que comparte Picking— es privada de
// `api/odoo/route.ts`, y sacarla de ahí obligaría a mover el cliente RPC, los mapeadores y el
// `unstable_cache` entero: mucho riesgo sobre el camino que usa Picking todo el día.
//
// Esta consulta corre **dos veces al día**, al registrar cada espejo. No es por pantalla ni por
// tienda. El cuidado de no saturar Odoo sigue valiendo para los caminos calientes; este no lo es.
//
// La lógica de CÁLCULO no se duplica: `armarCruce` y `valoresDeFila` son los mismos módulos que
// usa el cargador de días pasados (`scripts/cargar-cruce-pesos.mts`). Si fueran dos copias, una
// podría calcular distinto y nadie lo notaría hasta comparar dos filas a mano.

import { supabaseServer } from '@/lib/supabaseServer';
import { armarCruce, type MovimientoOdoo } from '@/features/despacho/shared/cruceDePesos';
import { valoresDeFila } from '@/features/despacho/shared/hojaCrucePesos';
// La suma vive en un módulo PURO y se re-exporta: un solo lugar donde se decide cuánto pesó una
// tienda, compartido con el cargador de días pasados.
export {
  sumarPesosPorTienda, conflictosDePeso, pesoCreible,
  type FilaDePeso, type ConflictoDePeso,
} from '@/features/despacho/shared/sumaPesosBodega';
import {
  sumarPesosPorTienda, conflictosDePeso, pesoCreible, type FilaDePeso,
} from '@/features/despacho/shared/sumaPesosBodega';

const ODOO_URL = process.env.NEXT_PUBLIC_ODOO_URL ?? '';
const ODOO_DB  = process.env.NEXT_PUBLIC_ODOO_DB ?? '';
const ODOO_USER = process.env.NEXT_PUBLIC_ODOO_USERNAME ?? '';
const ODOO_KEY  = process.env.NEXT_PUBLIC_ODOO_API_KEY ?? '';

async function rpc(params: unknown): Promise<unknown> {
  const r = await fetch(`https://${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params, id: 1 }),
  });
  const j = await r.json() as { result?: unknown; error?: unknown };
  if (j.error) throw new Error(`Odoo: ${JSON.stringify(j.error).slice(0, 200)}`);
  return j.result;
}

interface PickingCrudo {
  name: string;
  origin: string | false;
  total_weight: number | false;
  location_dest_id: [number, string] | false;
}

/**
 * Los movimientos del día, solo los REALIZADOS.
 *
 * Uno que todavía no se hizo no tiene peso definitivo, y compararlo contra el andén daría una
 * diferencia que no significa nada. Se trae un superset a propósito —incluye AUDITORIA y otros
 * tipos— porque `armarCruce` tiene su propia regla para descartarlos: filtrar acá y allá sería
 * tener la regla en dos sitios.
 */
export async function movimientosDelDia(fechaISO: string): Promise<MovimientoOdoo[]> {
  const uid = await rpc({ service: 'common', method: 'login', args: [ODOO_DB, ODOO_USER, ODOO_KEY] });
  const rows = await rpc({
    service: 'object', method: 'execute_kw',
    args: [ODOO_DB, uid, ODOO_KEY, 'stock.picking', 'search_read',
      [[['origin', 'like', 'Abastecimiento'],
        ['date_done', '>=', `${fechaISO} 00:00:00`], ['date_done', '<=', `${fechaISO} 23:59:59`],
        ['state', '=', 'done']]],
      { fields: ['name', 'origin', 'total_weight', 'location_dest_id'], limit: 2000 }],
  }) as PickingCrudo[];

  return rows.map(p => ({
    ref: p.name,
    origen: typeof p.origin === 'string' ? p.origin : '',
    destino: Array.isArray(p.location_dest_id) ? p.location_dest_id[1] : '',
    kg: typeof p.total_weight === 'number' ? p.total_weight : 0,
  }));
}

/**
 * Lee una tabla paginando de a 1000.
 *
 * PostgREST corta en ~1000 filas SIN avisar: una consulta sin paginar devuelve menos de lo que hay
 * y nadie se entera. `despacho_rm` pasa de 1.000 filas en un día cualquiera.
 */
async function porPaginas<T>(
  tabla: string, columnas: string, fechaDDMM?: string,
): Promise<T[]> {
  const sb = supabaseServer();
  const out: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const base = sb.from(tabla).select(columnas);
    const q = fechaDDMM ? base.eq('fecha', fechaDDMM) : base;
    const { data, error } = await q.range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    const lote = (data ?? []) as T[];
    out.push(...lote);
    if (lote.length < 1000) return out;
  }
}

/**
 * Los kilos que Bodega registró ese día, sumados por tienda, de LOS DOS espejos.
 *
 * Una tienda sin filas queda FUERA del mapa, no en cero: el que no esté es lo que hace que la
 * celda salga vacía en vez de decir «−100%», que se leería como "no llegó nada".
 */
export async function pesosDeBodega(fechaDDMM: string): Promise<Map<string, number>> {
  const [rm, reg] = await Promise.all([
    porPaginas<FilaDePeso>('despacho_rm', 'cod,peso_kg,tipo,picking_slot_id', fechaDDMM),
    porPaginas<FilaDePeso>('despacho_regiones', 'cod,peso_kg,tipo,picking_slot_id', fechaDDMM),
  ]);
  const filas = [...rm, ...reg];
  const balanza = await pesosDeLaBalanza(filas.map(f => f.picking_slot_id));
  // Los desacuerdos se DICEN. Quedarse con un peso sin avisar es decidir por el coordinador; que
  // quede en el log del servidor es la diferencia entre una regla y una decisión escondida.
  for (const c of conflictosDePeso(filas)) {
    console.warn(`[cruce] ${c.cod} unidad ${c.slot}: pesos distintos ${c.pesos.join(' / ')} → se usa ${
      (balanza.get(c.slot) ?? 0) > 0 ? `${balanza.get(c.slot)} (balanza)` : `${Math.max(...c.pesos)} (el mayor)`}`);
  }
  return sumarPesosPorTienda(filas, balanza);
}

/**
 * El peso que marcó LA BALANZA para cada unidad, leído de `picking_pallets` por id.
 *
 * Se consulta POR ID y no por fecha a propósito: la columna `fecha` de `despacho_*` mezcla el día
 * de armado con el de despacho —ver [[despacho-fecha-no-sirve-para-cruzar]]— así que filtrar por
 * día dejaría afuera justo las unidades cuyo sello no coincide con su slot. El id es exacto.
 *
 * Solo devuelve pesos USABLES (> 0). Una unidad sin peso en la balanza no borra el que traiga la
 * fila registrada: ese es el caso real del B3 de 57CAS el 01/10, que quedó en 17,5 en el registro
 * y nunca se escribió en el slot. Tomar la balanza a ciegas habría perdido esos kilos.
 */
export async function pesosDeLaBalanza(
  slotIds: readonly (number | null | undefined)[],
): Promise<Map<number, number>> {
  const ids = [...new Set(slotIds.filter((x): x is number => typeof x === 'number'))];
  const out = new Map<number, number>();
  if (!ids.length) return out;
  const sb = supabaseServer();
  // De a 500: una lista de ids muy larga revienta el largo de la URL de PostgREST.
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await sb
      .from('picking_pallets')
      .select('id,peso_kg,tipo')
      .in('id', ids.slice(i, i + 500));
    if (error) throw new Error(`picking_pallets: ${error.message}`);
    for (const r of data ?? []) {
      const f = r as { id: number; peso_kg: number | null; tipo: string | null };
      const kg = pesoCreible(f.peso_kg, f.tipo, f.id);
      if (kg > 0) out.set(f.id, kg);
    }
  }
  return out;
}





/** El catálogo de tiendas: los códigos válidos y su nombre. */
export async function catalogoTiendas(): Promise<{ codigos: Set<string>; nombres: Map<string, string> }> {
  type T = { codigo: string; nombre: string | null };
  const filas = await porPaginas<T>('tiendas', 'codigo,nombre');
  const codigos = new Set<string>();
  const nombres = new Map<string, string>();
  for (const t of filas) {
    const cod = String(t.codigo ?? '').toUpperCase().trim();
    if (!cod) continue;
    codigos.add(cod);
    nombres.set(cod, t.nombre ?? '');
  }
  return { codigos, nombres };
}

/** `2026-09-29` → `29/09/2026`, que es como se escribe la fecha en las tablas y en la hoja. */
export function aDDMM(fechaISO: string): string {
  return fechaISO.split('-').reverse().join('/');
}

/** Las filas del cruce de un día, listas para `escribirCruce`. */
export async function construirCruceDelDia(
  fechaISO: string,
): Promise<Record<string, string | number>[]> {
  const fechaDDMM = aDDMM(fechaISO);
  const [movs, { codigos, nombres }, pesos] = await Promise.all([
    movimientosDelDia(fechaISO),
    catalogoTiendas(),
    pesosDeBodega(fechaDDMM),
  ]);

  const ahora = new Date().toISOString();
  return armarCruce(movs, codigos).map(cruce => valoresDeFila({
    fecha: fechaDDMM,
    cruce,
    nombre: nombres.get(cruce.codigo) ?? '',
    // `null` y no 0 cuando Bodega no registró nada de esa tienda: la celda queda vacía. Un cero
    // diría "no vino nada", que es una afirmación distinta y más grave.
    kgBodega: pesos.has(cruce.codigo) ? (pesos.get(cruce.codigo) as number) : null,
    actualizado: ahora,
  }));
}
