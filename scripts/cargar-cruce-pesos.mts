// Carga la hoja CRUCE PESOS para un día YA PASADO.
//
//   npx tsx scripts/cargar-cruce-pesos.mts 2026-09-28            (paso en seco)
//   npx tsx scripts/cargar-cruce-pesos.mts 2026-09-28 --escribir
//
// Importa los MISMOS módulos que usa la app —`armarCruce`, `valoresDeFila`, `escribirCruce`— para
// que una fila cargada así sea idéntica a una escrita al registrar el día. Nada de lógica propia:
// si hubiera dos copias, una podría calcular distinto que la otra y nadie lo notaría hasta comparar
// dos filas a mano.
//
// Volver a correrlo sobre el mismo día ACTUALIZA las filas, no las duplica.

import fs from 'node:fs';
import { armarCruce, type MovimientoOdoo } from '../src/features/despacho/shared/cruceDePesos';
import { valoresDeFila } from '../src/features/despacho/shared/hojaCrucePesos';
import { sumarPesosPorTienda, conflictosDePeso, pesoCreible, type FilaDePeso } from '../src/features/despacho/shared/sumaPesosBodega';
import { dominioDespachosDelDia } from '../src/features/despacho/shared/dominioOdoo';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').map(l => {
    const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
    return m ? [m[1], m[2].replace(/[\r\n]/g, '').trim().replace(/^["']|["']$/g, '')] : null;
  }).filter(Boolean) as [string, string][],
);

const fecha = process.argv[2];
const escribir = process.argv.includes('--escribir');
if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '')) {
  console.error('Uso: npx tsx scripts/cargar-cruce-pesos.mts YYYY-MM-DD [--escribir]');
  process.exit(1);
}
const fechaDDMM = fecha.split('-').reverse().join('/');

const BASE = 'https://' + env.NEXT_PUBLIC_ODOO_URL;
async function rpc(params: unknown) {
  const r = await fetch(BASE + '/jsonrpc', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params, id: 1 }),
  });
  const j = await r.json() as { result?: unknown; error?: unknown };
  if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 300));
  return j.result;
}

async function movimientosDelDia(): Promise<MovimientoOdoo[]> {
  const DB = env.NEXT_PUBLIC_ODOO_DB, USER = env.NEXT_PUBLIC_ODOO_USERNAME, KEY = env.NEXT_PUBLIC_ODOO_API_KEY;
  const uid = await rpc({ service: 'common', method: 'login', args: [DB, USER, KEY] });
  // Superset a propósito: trae también AUDITORIA y otros tipos. `armarCruce` los descarta con su
  // propia regla, así que el resultado es el mismo que produciría la app.
  const rows = await rpc({
    service: 'object', method: 'execute_kw',
    args: [DB, uid, KEY, 'stock.picking', 'search_read',
      [dominioDespachosDelDia(fecha)],
      { fields: ['name', 'origin', 'total_weight', 'location_dest_id'], limit: 2000 }],
  }) as Array<{ name: string; origin: string | false; total_weight: number | false; location_dest_id: [number, string] | false }>;
  return rows.map(p => ({
    ref: p.name,
    origen: typeof p.origin === 'string' ? p.origin : '',
    destino: Array.isArray(p.location_dest_id) ? p.location_dest_id[1] : '',
    kg: typeof p.total_weight === 'number' ? p.total_weight : 0,
  }));
}

// Vía REST, con la clave de servicio: así el script no necesita ninguna dependencia que el
// repositorio no tenga ya.
async function rest<T>(ruta: string): Promise<T[]> {
  const cab = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const todo: T[] = [];
  // PostgREST corta en ~1000 filas SIN AVISAR. Se pagina siempre, aunque hoy entren.
  for (let desde = 0; ; desde += 1000) {
    const sep = ruta.includes('?') ? '&' : '?';
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${ruta}${sep}offset=${desde}&limit=1000`, { headers: cab });
    if (!r.ok) throw new Error(`${ruta} → ${r.status} ${(await r.text()).slice(0, 200)}`);
    const lote = await r.json() as T[];
    todo.push(...lote);
    if (lote.length < 1000) return todo;
  }
}

/**
 * El peso que marcó la balanza para cada unidad, de `picking_pallets`, POR ID.
 *
 * Por id y no por fecha: la columna `fecha` de `despacho_*` mezcla el día de armado con el de
 * despacho, así que filtrar por día dejaría afuera justo las unidades cuyo sello no coincide con
 * su slot. Solo pesos usables (> 0): una unidad sin peso en la balanza no borra el de su fila.
 */
async function pesosDeLaBalanza(
  slotIds: readonly (number | null | undefined)[],
): Promise<Map<number, number>> {
  const ids = [...new Set(slotIds.filter((x): x is number => typeof x === 'number'))];
  const out = new Map<number, number>();
  for (let i = 0; i < ids.length; i += 500) {   // la URL de PostgREST tiene largo máximo
    const lote = ids.slice(i, i + 500);
    const rows = await rest<{ id: number; peso_kg: number | null; tipo: string | null }>(
      `picking_pallets?select=id,peso_kg,tipo&id=in.(${lote.join(',')})`);
    for (const r of rows) {
      // El MISMO `pesoCreible` que usa la app, no una copia: escribir el techo dos veces es
      // justo la duplicación que este arreglo vino a sacar.
      const kg = pesoCreible(r.peso_kg, r.tipo, r.id);
      if (kg > 0) out.set(r.id, kg);
    }
  }
  return out;
}

async function deLaBase() {
  const tiendas = await rest<{ codigo: string; nombre: string }>('tiendas?select=codigo,nombre');
  const [rm, reg] = await Promise.all([
    rest<FilaDePeso>(`despacho_rm?select=cod,peso_kg,tipo,picking_slot_id&fecha=eq.${encodeURIComponent(fechaDDMM)}`),
    rest<FilaDePeso>(`despacho_regiones?select=cod,peso_kg,tipo,picking_slot_id&fecha=eq.${encodeURIComponent(fechaDDMM)}`),
  ]);
  const filas = [...rm, ...reg];
  // El peso de cada unidad sale de LA BALANZA, por id. Antes esto era una suma propia sin ningún
  // dedupe: cargar un día con unidades registradas dos veces escribía el doble en la planilla.
  const balanza = await pesosDeLaBalanza(filas.map(f => f.picking_slot_id));
  for (const c of conflictosDePeso(filas)) {
    const elegido = (balanza.get(c.slot) ?? 0) > 0
      ? `${balanza.get(c.slot)} (balanza)` : `${Math.max(...c.pesos)} (el mayor)`;
    console.warn(`  ⚠ ${c.cod} unidad ${c.slot}: pesos distintos ${c.pesos.join(' / ')} → se usa ${elegido}`);
  }
  const pesos = sumarPesosPorTienda(filas, balanza);
  // Lo que marcó la balanza ese día, por tienda — la columna TOTAL PESADO. Va a la FUENTE y no a
  // las filas registradas, porque la unidad que todavía no se mandó es justo la que hay que
  // mostrar. Mismas tres reglas que `pesadoEnBodega` en la app: por día de armado, sin agregados,
  // y el peso por `pesoCreible`.
  const pesados = new Map<string, number>();
  for (const r of await rest<{ id: number; store_cod: string | null; tipo: string | null;
                               peso_kg: number | null; is_active: boolean | null; combined_into: number | null }>(
    `picking_pallets?select=id,store_cod,tipo,peso_kg,is_active,combined_into&date=eq.${fecha}`)) {
    const cod = String(r.store_cod ?? '').trim().toUpperCase();
    if (!cod || r.is_active === false || r.combined_into != null) continue;
    if (r.tipo === 'A' || r.tipo === 'W') continue;
    const kg = pesoCreible(r.peso_kg, r.tipo, r.id);
    if (kg > 0) pesados.set(cod, (pesados.get(cod) ?? 0) + kg);
  }
  return {
    pesados,
    nombres: new Map(tiendas.map(r => [r.codigo.toUpperCase(), r.nombre])),
    codigos: new Set(tiendas.map(r => r.codigo.toUpperCase())),
    pesos,
  };
}

const [movs, base] = await Promise.all([movimientosDelDia(), deLaBase()]);
const cruces = armarCruce(movs, base.codigos);
const ahora = new Date().toISOString();

const valores = cruces.map(cruce => valoresDeFila({
  fecha: fechaDDMM,
  cruce,
  nombre: base.nombres.get(cruce.codigo) ?? '',
  // `null` y no 0: si Bodega no pesó, la celda queda vacía. Un cero diría "no vino nada".
  kgBodega: base.pesos.has(cruce.codigo) ? (base.pesos.get(cruce.codigo) as number) : null,
  kgPesado: base.pesados.has(cruce.codigo) ? (base.pesados.get(cruce.codigo) as number) : null,
  actualizado: ahora,
}));

const totalOdoo = cruces.reduce((s, c) => s + c.totalOdoo, 0);
console.log(`${fechaDDMM}  ·  movimientos de Odoo: ${movs.length}  ·  tiendas en la tabla: ${cruces.length}`);
console.log(`TOTAL ODOO: ${totalOdoo.toFixed(1)} kg  ·  con peso de Bodega: ${valores.filter(v => v['TOTAL BODEGA'] !== '').length}`);
// En seco se muestran TODAS: el paso en seco existe para revisar lo que se va a escribir, y una
// muestra de 5 de 29 no deja revisar nada. Al escribir, con 5 alcanza para ver que salió.
for (const v of (escribir ? valores.slice(0, 5) : valores)) {
  const falta = v['TOTAL PESADO'] !== '' && v['TOTAL BODEGA'] === '' ? '  ← pesado, SIN REGISTRAR' : '';
  console.log(`   ${v['CÓDIGO']}  odoo=${String(v['TOTAL ODOO']).padStart(8)}  pesado=${String(v['TOTAL PESADO']).padStart(8)}  registrado=${String(v['TOTAL BODEGA']).padStart(8)}  dif=${String(v['% DIF']).padStart(7)}${falta}`);
}

if (!escribir) {
  console.log('\nPASO EN SECO — no se escribió nada. Agregá --escribir.');
  process.exit(0);
}

process.env.GOOGLE_SPREADSHEET_ID = env.GOOGLE_SPREADSHEET_ID;
process.env.GOOGLE_SERVICE_ACCOUNT_JSON = env.GOOGLE_SERVICE_ACCOUNT_JSON;
const { escribirCruce } = await import('../src/lib/crucePesosSheet');
const r = await escribirCruce(valores);
console.log(`\nHoja: ${r.hojaCreada ? 'CREADA' : 'ya existía'}  ·  agregadas: ${r.agregadas}  ·  actualizadas: ${r.actualizadas}`);
