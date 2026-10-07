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
/** El tipo de operación de Odoo con el que el CD despacha a una tienda. */
export const TIPO_DESPACHO_A_TIENDAS = 'Despacho Tiendas';

/**
 * El dominio de Odoo que define «lo que el CD despachó ese día». PURO, para poder fijarlo.
 *
 * ── POR QUÉ NO ALCANZA `origin like 'Abastecimiento'` ──────────────────────────────────────────
 *
 * `origin` es texto libre, y los traslados ENTRE TIENDAS lo escriben igual. El 07/10/2026 el cruce
 * le abrió fila a 38SP2 —que ni siquiera estaba en el calendario— por estos tres movimientos:
 *
 *     38SP2/INT/01490  «Abastecimiento Comida Para SP2 desde PUC»   74,2 kg   75PUC → 38SP2
 *     38SP2/INT/01488  «Abastecimiento Chocolates para SP2 desde PUC» 19,9 kg
 *     31TLC/INT/01536  «Guía de Abastecimiento Hogar 23/09/2026»    152,6 kg
 *
 * Pucón mandándole mercadería a San Pedro. Movimientos reales, pero no son despachos del CD: el
 * cruce compara lo que salió de Recoleta contra lo que Bodega pesó, y eso no salió de Recoleta.
 * El último encima arrastra una guía del 23/09 al día de hoy.
 *
 * Medido contra Odoo del 01/08 al 07/10 (52 días): de 9.306 movimientos que traía el filtro viejo,
 * **680 (7,3%) no eran despachos** — traslados entre tiendas, transferencias internas del CD,
 * ajustes de inventario y hasta MERMAS (`99REC/MERMA`). Con el tipo de operación: 8.618 y cero
 * impostores.
 *
 * ── POR QUÉ EL TIPO Y NO EL PREFIJO DEL NOMBRE ─────────────────────────────────────────────────
 *
 * `name like '99REC/DT/'` da exactamente el mismo resultado, pero es el prefijo de una secuencia:
 * el día que el CD cambie de código, o se abra un segundo, los despachos desaparecerían del cruce
 * EN SILENCIO — que es peor que un sobrante, porque un sobrante se ve. El tipo de operación es lo
 * que alguien configuró en Odoo para decir «esto es un despacho a tienda», y un CD nuevo traería
 * el suyo con el mismo nombre.
 *
 * `picking_type_id.code = 'outgoing'` NO sirve: devuelve cero. En este Odoo el despacho del CD a
 * la tienda está tipado como movimiento interno, porque las dos bodegas son de la misma empresa.
 */
export function dominioDespachosDelDia(fechaISO: string): (string | number)[][] {
  return [
    ['picking_type_id.name', '=', TIPO_DESPACHO_A_TIENDAS],
    ['origin', 'like', 'Abastecimiento'],
    ['date_done', '>=', `${fechaISO} 00:00:00`],
    ['date_done', '<=', `${fechaISO} 23:59:59`],
    ['state', '=', 'done'],
  ];
}

export async function movimientosDelDia(fechaISO: string): Promise<MovimientoOdoo[]> {
  const uid = await rpc({ service: 'common', method: 'login', args: [ODOO_DB, ODOO_USER, ODOO_KEY] });
  const rows = await rpc({
    service: 'object', method: 'execute_kw',
    args: [ODOO_DB, uid, ODOO_KEY, 'stock.picking', 'search_read',
      [dominioDespachosDelDia(fechaISO)],
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
  const [movs, { codigos, nombres }, pesos, pesados] = await Promise.all([
    movimientosDelDia(fechaISO),
    catalogoTiendas(),
    pesosDeBodega(fechaDDMM),
    pesadoEnBodega(fechaISO),
  ]);

  const ahora = new Date().toISOString();
  return armarCruce(movs, codigos).map(cruce => valoresDeFila({
    fecha: fechaDDMM,
    cruce,
    nombre: nombres.get(cruce.codigo) ?? '',
    // `null` y no 0 cuando Bodega no registró nada de esa tienda: la celda queda vacía. Un cero
    // diría "no vino nada", que es una afirmación distinta y más grave.
    kgBodega: pesos.has(cruce.codigo) ? (pesos.get(cruce.codigo) as number) : null,
    kgPesado: pesados.has(cruce.codigo) ? (pesados.get(cruce.codigo) as number) : null,
    actualizado: ahora,
  }));
}

/**
 * Lo que marcó LA BALANZA ese día, por tienda. Sale de `picking_pallets`, no de lo registrado.
 *
 * ── POR QUÉ NO SIRVE `pesosDeBodega` PARA ESTO ─────────────────────────────────────────────────
 *
 * Esa función recorre las filas REGISTRADAS, así que una unidad pesada que todavía no se mandó no
 * aparece — y es justamente la que esta columna existe para mostrar. Acá se va a la fuente.
 *
 * ── LAS TRES REGLAS, QUE SON LAS MISMAS DE SIEMPRE ─────────────────────────────────────────────
 *
 * · Por `date`, que es el día de ARMADO, igual que la columna `fecha` de `despacho_*` y que la
 *   fila del cruce. Verificado: el 01/10 da 0 tiendas pesadas-sin-registrar (los dos espejos
 *   habían registrado) y el 02/10 da 18, que son exactamente las de RM/Costa sin registrar.
 *
 * · Los AGREGADOS quedan fuera (`tipo not in ('A','W')`). Una adquisición y un web/retiro no
 *   existen del lado de Odoo, así que sumarlos inflaría este lado igual que el otro.
 *
 * · El peso pasa por `pesoCreible`, el mismo techo del #656. Sin eso el slot 132 —los 9.357,5 kg
 *   de 55ITA— se publicaría en la columna nueva, que es exactamente el agujero que ese arreglo
 *   tapó en la otra.
 *
 * ── LO QUE ESTA COLUMNA NO PUEDE MOSTRAR ───────────────────────────────────────────────────────
 *
 * La lista de filas la arma Odoo (`armarCruce`), así que una tienda que Bodega pesó y Odoo NO
 * despachó no tiene fila donde aparecer. El 02/10 las 26 tiendas pesadas son exactamente las 26
 * filas de la hoja, así que hoy no es un hueco; queda dicho para el día que lo sea.
 */
export async function pesadoEnBodega(fechaISO: string): Promise<Map<string, number>> {
  const sb = supabaseServer();
  const out = new Map<string, number>();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb
      .from('picking_pallets')
      .select('id,store_cod,tipo,peso_kg,is_active,combined_into')
      .eq('date', fechaISO)
      .range(desde, desde + 999);
    if (error) throw new Error(`picking_pallets: ${error.message}`);
    const lote = (data ?? []) as {
      id: number; store_cod: string | null; tipo: string | null;
      peso_kg: number | null; is_active: boolean | null; combined_into: number | null;
    }[];
    for (const r of lote) {
      const cod = String(r.store_cod ?? '').trim().toUpperCase();
      if (!cod) continue;
      if (r.is_active === false) continue;          // borrada
      if (r.combined_into != null) continue;        // su peso ya está dentro de otra unidad
      if (r.tipo === 'A' || r.tipo === 'W') continue;  // los agregados no entran al cruce
      const kg = pesoCreible(r.peso_kg, r.tipo, r.id);
      if (kg > 0) out.set(cod, (out.get(cod) ?? 0) + kg);
    }
    if (lote.length < 1000) break;   // PostgREST corta en ~1000 SIN avisar
  }
  return out;
}
