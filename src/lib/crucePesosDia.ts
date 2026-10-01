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
import { esAgregado } from '@/features/despacho/shared/adquisicion';

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
  return sumarPesosPorTienda([...rm, ...reg]);
}

export interface FilaDePeso {
  cod: string | null;
  peso_kg: number | null;
  tipo: string | null;
  /** La unidad de Picking detrás de la fila. `null` en las que no tienen vínculo. */
  picking_slot_id?: number | null;
}

/**
 * Suma por tienda, **contando cada unidad UNA sola vez**.
 *
 * ── POR QUÉ HACE FALTA DEDUPLICAR (01/10/2026) ─────────────────────────────────────────────────
 *
 * El 30/09 cada unidad de RM terminó con DOS filas pesadas: una con el sello del armado y otra con
 * el del despacho, con el MISMO peso y apuntando al MISMO slot. Normalmente la del armado va sin
 * peso — esa es la señal de que una es el borrador y la otra el registro.
 *
 * Fueron **71 filas en 19 tiendas, 12.622,8 kg de más**. La hoja mostraba todavía los valores
 * buenos porque se había escrito antes, pero la siguiente carga habría puesto el doble: 05LP en
 * 2.309,4 en vez de 1.154,7, 07CCR en 1.218 en vez de 609. Esa hoja la mira Jefatura.
 *
 * ── QUÉ DEDUPLICA, Y QUÉ NO ────────────────────────────────────────────────────────────────────
 *
 * Solo las copias EXACTAS: mismo slot y mismo peso. Eso es lo que se midió — de las 71, ninguna
 * tenía un peso distinto— y es lo único que se puede descartar sin elegir por nadie.
 *
 * Dos filas del mismo slot con pesos DISTINTOS se siguen sumando las dos. No es un descuido: ahí
 * no hay forma de saber cuál vale sin mirar la balanza, y quedarse con una en silencio sería
 * decidir por el coordinador. Que el número salga alto es molesto y se ve; que el sistema elija mal
 * y no lo diga es lo que vinimos arreglando toda la semana.
 */
export function sumarPesosPorTienda(filas: readonly FilaDePeso[]): Map<string, number> {
  const pesos = new Map<string, number>();
  const vistas = new Set<string>();
  for (const f of filas) {
    const cod = String(f.cod ?? '').toUpperCase().trim();
    if (!cod) continue;
    // LOS AGREGADOS NO ENTRAN AL CRUCE.
    //
    // Este cuadro compara lo que Odoo despachó como ABASTECIMIENTO contra lo que Bodega pesó de
    // ese mismo abastecimiento. Una adquisición es una compra y un web/retiro es un pedido que el
    // cliente pasa a buscar: ninguno de los dos existe del lado de Odoo, así que sumarlos al
    // TOTAL BODEGA inflaría ese lado y la tienda aparecería con un excedente que no es real.
    //
    // Se descartan por TIPO y no por peso: hoy llegan en 0 —no se pesan—, pero el día que alguien
    // le ponga un peso a uno, tiene que seguir quedando afuera. Filtrar por "peso 0" habría
    // funcionado hasta ese día y fallado justo cuando el dato empezara a existir.
    if (esAgregado(f.tipo)) continue;
    const kg = Number(f.peso_kg) || 0;
    // La misma unidad con el mismo peso, otra vez: es la copia, no carga nueva. Sin `slot` no hay
    // cómo saber si es la misma unidad, así que esa fila entra igual — perder carga real sería
    // peor que contar de más.
    if (f.picking_slot_id != null) {
      const llave = `${f.picking_slot_id}:${kg}`;
      if (vistas.has(llave)) continue;
      vistas.add(llave);
    }
    pesos.set(cod, (pesos.get(cod) ?? 0) + kg);
  }
  return pesos;
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
