/**
 * Sacar del despacho la unidad que se acaba de borrar en Picking.
 *
 * Existe por 51SER el 2026-09-11: un pallet ya registrado por Bodega se borró en Picking a las
 * 13:26 y su fila de 177 kg siguió en el registro — el camión salió con un pallet en el papel que
 * no existía. La limpieza ya se intentaba, pero fallaba por tres lados:
 *
 *  1. Solo miraba `despacho_rm`. 51SER es Nacional, que vive en `despacho_regiones`.
 *  2. Buscaba por `picking_slot_id`, una columna que estaba vacía en 107 de 118 filas del día (y en
 *     el 100% de los días anteriores) porque la sincronización desde la planilla no la copiaba.
 *     Eso se arregla en `sync-despacho/parseRows.ts`.
 *  3. No tocaba la planilla. Aunque la fila desapareciera de la base, la sincronización siguiente
 *     la reinserta (hace upsert con `ignoreDuplicates`: todo id que esté en la hoja y no en la base
 *     vuelve). Borrar en la base sin borrar en la hoja no borra nada de forma estable.
 *
 * La consulta a la base es la que decide: si la unidad no tiene fila de despacho —el caso normal,
 * una unidad que se borra antes de que Bodega la registre— no se llama a Google.
 */

import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

/** Las dos bodegas: tabla espejo ↔ hoja de la planilla. */
const DESTINOS = [
  { tabla: 'despacho_rm',       hoja: 'DESPACHO RM' },
  { tabla: 'despacho_regiones', hoja: 'DESPACHO REGIONES' },
] as const;

/**
 * Números de fila (1-indexados, **de mayor a menor**) cuya celda de la columna A está en `ids`.
 *
 * De mayor a menor porque borrar una fila corre hacia arriba a las de abajo: al revés, el segundo
 * borrado se llevaría la fila equivocada. La fila 1 es el encabezado y nunca entra.
 */
export function filasPorId(colA: (string | number | null | undefined)[], ids: Set<string>): number[] {
  const filas: number[] = [];
  for (let i = 1; i < colA.length; i++) {
    if (ids.has(String(colA[i] ?? '').trim())) filas.push(i + 1);
  }
  return filas.sort((a, b) => b - a);
}

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no configurado');
  const clean = raw.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  return JSON.parse(clean);
}

/** Borra de la hoja las filas cuyos ids se indican. Nunca lanza: devuelve cuántas borró. */
async function borrarFilasDeLaHoja(hoja: string, ids: Set<string>): Promise<number> {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: getCredentials(),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const gs = google.sheets({ version: 'v4', auth });
    // Solo la columna A: alcanza para ubicar las filas y evita traerse la hoja entera.
    const res  = await gs.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${hoja}!A:A` });
    const colA = (res.data.values ?? []).map(f => f?.[0]);
    const filas = filasPorId(colA, ids);
    if (!filas.length) return 0;

    const meta = await gs.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets.properties' });
    const sid  = (meta.data.sheets ?? []).find(s => s.properties?.title === hoja)?.properties?.sheetId;
    if (sid === undefined || sid === null) return 0;

    await gs.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: filas.map(fila => ({
        deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: fila - 1, endIndex: fila } },
      })) },
    });
    return filas.length;
  } catch (err) {
    // Que Google esté caído no puede impedir borrar la unidad: se avisa y se sigue.
    console.error(`[limpiarDespacho] ${hoja}:`, err);
    return 0;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Cliente de Supabase con service-role (supabaseServer()). */
type Sb = { from: (t: string) => any };

/**
 * Quita del registro de despacho (base + planilla) todas las filas de esa unidad de Picking.
 * Devuelve cuántas quitó de cada lado, para poder avisar si la planilla quedó atrás.
 */
export async function sacarUnidadDelDespacho(sb: Sb, slotId: number): Promise<{ base: number; hoja: number }> {
  let base = 0, hoja = 0;
  for (const destino of DESTINOS) {
    const { data, error: errSel } = await sb.from(destino.tabla).select('id').eq('picking_slot_id', slotId);
    if (errSel) { console.error(`[limpiarDespacho] select ${destino.tabla}:`, errSel.message); continue; }
    const ids = (data ?? []).map((r: { id: string }) => String(r.id)).filter(Boolean);
    if (!ids.length) continue;

    const { error } = await sb.from(destino.tabla).delete().eq('picking_slot_id', slotId);
    if (error) { console.error(`[limpiarDespacho] delete ${destino.tabla}:`, error.message); continue; }
    base += ids.length;
    hoja += await borrarFilasDeLaHoja(destino.hoja, new Set(ids));
  }
  return { base, hoja };
}
