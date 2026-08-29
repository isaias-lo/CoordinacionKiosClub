import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/apiAuth';
import { google } from 'googleapis';
import { supabaseServer } from '@/lib/supabaseServer';
import { pickFaltantesIdx, faltanteId } from '@/features/despacho/rutas/utils/registroFaltantes';
import { esRespaldoEnrutador, reconciliarRespaldo, aplicarRuteoAFila, aplicarRuteoARecord, COL_RUTEO, type FilaRespaldo } from '@/features/despacho/rutas/utils/reconciliarRespaldo';
import { clavesConPatente } from './asignacion';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

const ALLOWED_SHEETS = new Set(['DESPACHO REGIONES', 'DESPACHO RM', 'DESPACHO CONGELADOS', 'RECEPCIÓN TIENDA', 'HISTORIAL', 'CONTROL DESPACHO']);

// ── Caché de sheetId por nombre de hoja (se llena una vez por proceso) ──────────
// Evita llamar spreadsheets.get en cada request; se invalida solo si el proceso reinicia.
const sheetIdCache: Record<string, number> = {};

/**
 * Obtiene el sheetId (número interno) de una hoja por su nombre.
 * Resultado cacheado en memoria — una sola llamada a la API por nombre por proceso.
 */
async function getSheetId(gs: ReturnType<typeof google.sheets>, sheetName: string): Promise<number | null> {
  if (sheetIdCache[sheetName] !== undefined) return sheetIdCache[sheetName];
  const meta = await gs.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties',
  });
  for (const s of meta.data.sheets ?? []) {
    const p = s.properties;
    if (p?.title && p.sheetId !== undefined && p.sheetId !== null) {
      sheetIdCache[p.title] = p.sheetId;
    }
  }
  return sheetIdCache[sheetName] ?? null;
}

/**
 * Parsea un rango A1 devuelto por spreadsheets.values.append (p.ej. "HISTORIAL!A100:L105")
 * y devuelve { startRow, endRow } en base 0 (para GridRange).
 * Retorna null si el rango no puede parsearse.
 */
function parseUpdatedRange(updatedRange: string | null | undefined): { startRow: number; endRow: number } | null {
  if (!updatedRange) return null;
  // Formato: "NombreHoja!A100:L105" o "NombreHoja!A100"
  const match = updatedRange.match(/!(?:[A-Z]+)(\d+)(?::[A-Z]+(\d+))?/);
  if (!match) return null;
  const startRow = parseInt(match[1]) - 1; // A1 notation → 0-indexed
  const endRow   = match[2] ? parseInt(match[2]) : startRow + 1; // 0-indexed exclusive
  if (isNaN(startRow) || isNaN(endRow)) return null;
  return { startRow, endRow };
}

/**
 * Aplica formato de fecha (DD/MM/YYYY) a la columna especificada en el rango de filas recién
 * agregadas. Esto evita que Google Sheets muestre el número serial (p.ej. 46206) en vez
 * de la fecha legible cuando se hace append con valueInputOption USER_ENTERED.
 *
 * Google Sheets interpreta "03/07/2026" como fecha y la convierte al serial 46206.
 * El serial es correcto internamente, pero sin formato de fecha en la celda aparece como número.
 * La solución es aplicar un numberFormat { type: 'DATE', pattern: 'dd/mm/yyyy' } post-append.
 *
 * @param gs          Instancia de Sheets autenticada
 * @param sheetName   Nombre de la hoja (para obtener su sheetId)
 * @param updatedRange Rango devuelto por el append (A1 notation), p.ej. "HISTORIAL!A100:L105"
 * @param colIndex    Índice 0 de la columna de fecha (0 = col A)
 */
async function applyDateFormat(
  gs: ReturnType<typeof google.sheets>,
  sheetName: string,
  updatedRange: string | null | undefined,
  colIndex: number,
): Promise<void> {
  const sheetId = await getSheetId(gs, sheetName);
  if (sheetId === null) return;
  const rows = parseUpdatedRange(updatedRange);
  if (!rows) return;
  await gs.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rows.startRow,
            endRowIndex:   rows.endRow,
            startColumnIndex: colIndex,
            endColumnIndex:   colIndex + 1,
          },
          cell: {
            userEnteredFormat: {
              numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' },
            },
          },
          fields: 'userEnteredFormat.numberFormat',
        },
      }],
    },
  });
}

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no configurado');
  const clean = raw.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  return JSON.parse(clean);
}

async function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function n(v: string | number): number | null {
  if (typeof v === 'number') return v;
  const parsed = parseFloat(String(v));
  return isNaN(parsed) ? null : parsed;
}

function parseSheetDate(s: string): string | null {
  const [dd, mm, yyyy] = String(s).split('/');
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

// DESPACHO RM/REGIONES — 26 cols A:Z + AA=PIONETA1 + AB=PIONETA2 + AC=FECHA_ARMADO + AD=CÓDIGO
function toRmRecord(row: (string | number)[]) {
  return {
    id:               String(row[0]  ?? ''),
    fecha:            String(row[1]  ?? ''),
    cod:              String(row[2]  ?? ''),
    tienda:           String(row[3]  ?? ''),
    tipo:             String(row[4]  ?? ''),
    regimen:          String(row[5]  ?? ''),
    transporte:       String(row[6]  ?? ''),
    patente:          String(row[7]  ?? ''),
    carga:            String(row[8]  ?? ''),
    region:           String(row[9]  ?? ''),
    comuna:           String(row[10] ?? ''),
    tipo_comuna:      String(row[11] ?? ''),
    peso_kg:          n(row[12] ?? ''),
    alto:             n(row[13] ?? ''),
    largo:            n(row[14] ?? ''),
    ancho:            n(row[15] ?? ''),
    peso_v:           n(row[16] ?? ''),
    ventana:          String(row[17] ?? ''),
    estado:           String(row[18] ?? ''),
    n_pallet_bulto:   String(row[19] ?? ''),
    fecha_llegada:    String(row[20] ?? ''),
    conductor:        String(row[21] ?? ''),
    ruta:             String(row[22] ?? ''),
    supervisor:       String(row[23] ?? ''),
    guia:             String(row[24] ?? ''),
    valor:            n(row[25] ?? ''),
    fecha_armado:     row[28] ? parseSheetDate(String(row[28])) : null,
    picking_slot_id:  row[29] ? Number(row[29]) || null : null,  // col AD = #488 (id del pallet). El canonical va en `id` (col A).
    seguimiento: 'Registrado',
  };
}

function toRegionesRecord(row: (string | number)[]) {
  return {
    id:               String(row[0]  ?? ''),
    fecha:            String(row[1]  ?? ''),
    cod:              String(row[2]  ?? ''),
    tienda:           String(row[3]  ?? ''),
    tipo:             String(row[4]  ?? ''),
    regimen:          String(row[5]  ?? ''),
    transporte:       String(row[6]  ?? ''),
    patente:          String(row[7]  ?? ''),
    carga:            String(row[8]  ?? ''),
    region:           String(row[9]  ?? ''),
    comuna:           String(row[10] ?? ''),
    tipo_comuna:      String(row[11] ?? ''),
    peso_kg:          n(row[12] ?? ''),
    alto:             n(row[13] ?? ''),
    largo:            n(row[14] ?? ''),
    ancho:            n(row[15] ?? ''),
    peso_v:           n(row[16] ?? ''),
    ventana:          String(row[17] ?? ''),
    estado:           String(row[18] ?? ''),
    n_pallet_bulto:   String(row[19] ?? ''),
    fecha_llegada:    String(row[20] ?? ''),
    conductor:        String(row[21] ?? ''),
    ruta:             String(row[22] ?? ''),
    supervisor:       String(row[23] ?? ''),
    guia:             String(row[24] ?? ''),
    valor:            n(row[25] ?? ''),
    fecha_armado:     row[28] ? parseSheetDate(String(row[28])) : null,
    picking_slot_id:  row[29] ? Number(row[29]) || null : null,  // col AD = #488 (id del pallet). El canonical va en `id` (col A).
    seguimiento: 'Registrado',
  };
}

export async function POST(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const body = await request.json() as { sheet: string; rows?: (string | number)[][]; fuente?: string; action?: string; items?: unknown[]; tabla?: string };
    const { sheet, rows = [], fuente, action } = body;

    if (!ALLOWED_SHEETS.has(sheet)) {
      return NextResponse.json({ error: `Hoja no permitida: ${sheet}` }, { status: 400 });
    }
    // rows vacío solo es error cuando no es una acción especial
    if (!action && (!Array.isArray(rows) || rows.length === 0)) {
      return NextResponse.json({ error: 'rows vacío' }, { status: 400 });
    }

    const auth = await getAuth();
    const gs   = google.sheets({ version: 'v4', auth });

    // ── DESPACHO RM: update-pionetas — batchUpdate AA:AB por cod+fecha ──
    if (sheet === 'DESPACHO RM' && body.action === 'update-pionetas') {
      const items = body.items as { cods: string[]; fecha: string; p1: string; p2: string }[];
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ ok: true, updated: 0 });
      }
      const readRes = await gs.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range:         'DESPACHO RM!A:C',
      });
      const sheetRows = readRes.data.values ?? [];
      const rowMap = new Map<string, number>();
      for (let i = 1; i < sheetRows.length; i++) {
        const r = sheetRows[i];
        if (r?.[1] && r?.[2]) rowMap.set(`${r[1]}::${r[2]}`, i + 1);
      }
      const updateData: { range: string; values: string[][] }[] = [];
      for (const item of items) {
        for (const cod of item.cods) {
          const rowNum = rowMap.get(`${item.fecha}::${cod}`);
          if (!rowNum) continue;
          updateData.push({ range: `DESPACHO RM!AA${rowNum}:AB${rowNum}`, values: [[item.p1, item.p2]] });
        }
      }
      if (updateData.length > 0) {
        await gs.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody:   { valueInputOption: 'USER_ENTERED', data: updateData },
        });
      }
      return NextResponse.json({ ok: true, updated: updateData.length });
    }

    // ── DESPACHO RM / REGIONES: split enrutador vs bodega paths ──────
    if (sheet === 'DESPACHO RM' || sheet === 'DESPACHO REGIONES') {
      const sb      = supabaseServer();
      const table   = sheet === 'DESPACHO RM' ? 'despacho_rm' : 'despacho_regiones';
      const records = sheet === 'DESPACHO RM'
        ? rows.map(toRmRecord)
        : rows.map(toRegionesRecord);

      // Enrutador sends no dimension data; Bodega (Santiago / Regiones) sends dimensions.
      const hasDims = records.some(r => (r as Record<string,unknown>).peso_kg !== null);

      if (!hasDims) {
        // ── Enrutador path: UPDATE existing rows — no append ──────────
        // Santiago/Bodega already wrote the rows with P-prefix IDs.
        // We find those rows by (fecha, cod) and update only routing columns:
        // G=transporte, H=patente, S=estado, V=conductor, W=ruta, X=supervisor

        // 1. Read sheet to map (fecha::cod) → sheet row numbers (1-indexed)
        const readRes = await gs.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range:         `${sheet}!A:X`,
        });
        const sheetRows = readRes.data.values || [];

        const rowMap = new Map<string, number[]>();
        for (let i = 0; i < sheetRows.length; i++) {
          const r = sheetRows[i];
          if (!r || !r[1] || !r[2]) continue;
          // Skip header-like rows (fecha column should look like DD/MM/YYYY)
          if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(r[1]))) continue;
          const key = `${String(r[1])}::${String(r[2])}`;
          if (!rowMap.has(key)) rowMap.set(key, []);
          rowMap.get(key)!.push(i + 1); // Sheets rows are 1-indexed
        }

        // 2. Build batchUpdate for matching rows
        const updateData: { range: string; values: string[][] }[] = [];
        const seenSheets = new Set<string>();

        for (const r of records) {
          const key = `${r.fecha}::${r.cod}`;
          if (seenSheets.has(key)) continue;
          seenSheets.add(key);
          const rm = r as Record<string, string | null>;
          for (const rowNum of rowMap.get(key) ?? []) {
            // G:H = transporte, patente
            updateData.push({ range: `${sheet}!G${rowNum}:H${rowNum}`, values: [[rm.transporte ?? '', rm.patente ?? '']] });
            // S = estado
            updateData.push({ range: `${sheet}!S${rowNum}`, values: [[rm.estado ?? '']] });
            // V:X = conductor, ruta, supervisor
            updateData.push({ range: `${sheet}!V${rowNum}:X${rowNum}`, values: [[rm.conductor ?? '', rm.ruta ?? '', rm.supervisor ?? '']] });
          }
        }

        if (updateData.length > 0) {
          await gs.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody:   { valueInputOption: 'USER_ENTERED', data: updateData },
          });
        }

        // 3. Mirror to Supabase — UPDATE by (fecha, cod)
        const seenSupa = new Set<string>();
        for (const r of records) {
          const key = `${r.fecha}::${r.cod}`;
          if (seenSupa.has(key)) continue;
          seenSupa.add(key);
          const rm = r as Record<string, unknown>;
          const { error } = await sb.from(table)
            .update({ conductor: rm.conductor, ruta: rm.ruta, supervisor: rm.supervisor,
                      transporte: rm.transporte, patente: rm.patente, estado: rm.estado, ventana: rm.ventana })
            .eq('fecha', r.fecha)
            .eq('cod', r.cod)
            .eq('conductor_modificado', false);
          if (error) console.error(`[sheets-write] Supabase update ${table}:`, error.message);
        }

        // ── Tiendas ruteadas SIN fila previa (no pasaron por Bodega) → APPEND ─────────
        // Antes se descartaban en silencio (el enrutador es update-only). Ahora se agregan
        // con los datos de ruteo (idempotente: id determinista por fecha+cod; al re-registrar
        // la fila ya existe y cae en el update de arriba). Se devuelven los cods agregados
        // para que el cliente avise ("sin datos de Bodega").
        const faltaIdx = pickFaltantesIdx(
          records.map(r => { const rr = r as Record<string, string | null>; return { fecha: rr.fecha, cod: rr.cod }; }),
          new Set(rowMap.keys()),
        );
        const appended: string[] = [];
        if (faltaIdx.length > 0) {
          const faltaRows: (string | number)[][] = [];
          const faltaRecords: Record<string, unknown>[] = [];
          for (const i of faltaIdx) {
            const rec   = records[i] as Record<string, unknown>;
            const genId = faltanteId(String(rec.fecha ?? ''), String(rec.cod ?? ''));
            const row   = [...rows[i]];
            if (!row[0]) row[0] = genId;
            faltaRows.push(row);
            faltaRecords.push({ ...rec, id: rec.id || genId });
            appended.push(String(rec.cod ?? ''));
          }
          const faltaAppendRes = await gs.spreadsheets.values.append({
            spreadsheetId:    SPREADSHEET_ID,
            range:            `${sheet}!A1`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            requestBody:      { values: faltaRows },
          });
          // Fix: USER_ENTERED convierte "DD/MM/YYYY" a serial de fecha (p.ej. 46206).
          // DESPACHO RM/REGIONES escribe la fecha en col B (índice 1). Aplicar formato post-append.
          await applyDateFormat(gs, sheet, faltaAppendRes.data.updates?.updatedRange, 1);
          const withFuente = fuente ? faltaRecords.map(r => ({ ...r, fuente })) : faltaRecords;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await sb.from(table).upsert(withFuente as any[], { onConflict: 'id' });
          if (error) console.error(`[sheets-write] Supabase upsert faltantes ${table}:`, error.message);
        }

        // Asignar patente = tienda lista para salir → avanzar seguimiento Registrado → Pendiente.
        // Antes el mirror a Supabase escribía patente/estado pero NO tocaba `seguimiento`, así que
        // una tienda asignada a un vehículo seguía en "Registrado" en el panel. Guard: solo toca
        // 'Registrado' → nunca regresa Recibido/Diferencia/En camino/Entregado.
        const asignadas = clavesConPatente(records);
        for (const { fecha, cod } of asignadas) {
          const { error } = await sb.from(table).update({ seguimiento: 'Pendiente' })
            .eq('fecha', fecha).eq('cod', cod).eq('seguimiento', 'Registrado');
          if (error) console.error(`[sheets-write] Supabase seguimiento ${table}:`, error.message);
        }

        return NextResponse.json({ ok: true, updated: updateData.length > 0 ? seenSheets.size : 0, appended });

      } else {
        // ── Bodega path: append filas nuevas (idempotente por id) + RECONCILIAR el respaldo ──
        // Si el Enrutador cerró el camión ANTES de que Bodega registrara, dejó filas de respaldo
        // (ids R…/ENR-…: con ruteo pero sin dimensiones). Las filas por-pallet de Bodega HEREDAN
        // ese ruteo y el respaldo se ELIMINA — si no, quedan dos juegos de filas para el mismo
        // despacho (el bug de "registros dobles").
        const readRes = await gs.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range:         `${sheet}!A:X`,
        });
        const sheetRows  = readRes.data.values || [];
        const sheetIdSet = new Set<string>();
        const respaldo: FilaRespaldo[] = [];
        for (let i = 0; i < sheetRows.length; i++) {
          const r = sheetRows[i]; if (!r) continue;
          const id = String(r[0] ?? '');
          if (id) sheetIdSet.add(id);
          if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(r[1] ?? ''))) continue; // solo filas de datos
          if (!esRespaldoEnrutador(id)) continue;
          respaldo.push({
            fila: i + 1, id, fecha: String(r[1] ?? ''), cod: String(r[2] ?? ''),
            transporte: String(r[COL_RUTEO.transporte] ?? ''), patente: String(r[COL_RUTEO.patente] ?? ''),
            estado: String(r[COL_RUTEO.estado] ?? ''), conductor: String(r[COL_RUTEO.conductor] ?? ''),
            ruta: String(r[COL_RUTEO.ruta] ?? ''), supervisor: String(r[COL_RUTEO.supervisor] ?? ''),
          });
        }

        const claves = new Set(records.map(r => `${(r as Record<string, unknown>).fecha}::${(r as Record<string, unknown>).cod}`));
        const { ruteoPorClave, filasABorrar, idsABorrar } = reconciliarRespaldo(claves, respaldo);

        // Heredar el ruteo del respaldo en las filas (hoja) y records (Supabase) de Bodega.
        const rutRow = (row: (string | number)[]) => {
          const rt = ruteoPorClave.get(`${row[1]}::${row[2]}`);
          return rt ? aplicarRuteoAFila(row, rt) : row;
        };
        const rutRec = <T extends Record<string, unknown>>(rec: T) => {
          const rt = ruteoPorClave.get(`${rec.fecha}::${rec.cod}`);
          return rt ? aplicarRuteoARecord(rec, rt) : rec;
        };

        // Append SOLO filas nuevas (idempotente por id), ya con el ruteo heredado.
        const newSheetRows = rows.filter(r => !sheetIdSet.has(String(r[0]))).map(rutRow);
        if (newSheetRows.length > 0) {
          await gs.spreadsheets.values.append({
            spreadsheetId:    SPREADSHEET_ID,
            range:            `${sheet}!A1`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            requestBody:      { values: newSheetRows },
          });
        }

        // Borrar de la HOJA las filas de respaldo (deleteDimension, ya vienen en orden descendente).
        if (filasABorrar.length > 0) {
          const sid = await getSheetId(gs, sheet);
          if (sid !== null) {
            await gs.spreadsheets.batchUpdate({
              spreadsheetId: SPREADSHEET_ID,
              requestBody: { requests: filasABorrar.map(fila => ({
                deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: fila - 1, endIndex: fila } },
              })) },
            });
          }
        }
        // Borrar de Supabase las filas de respaldo (su info ya está en las P…).
        if (idsABorrar.length > 0) {
          const { error } = await sb.from(table).delete().in('id', idsABorrar);
          if (error) console.error(`[sheets-write] Supabase delete respaldo ${table}:`, error.message);
        }

        const enriched = records.map(r => rutRec(r as Record<string, unknown>));
        const ids = enriched.map(r => r.id as string);
        const { data: existing } = await sb.from(table).select('id').in('id', ids);
        const existingIds = new Set((existing ?? []).map((e: { id: string }) => e.id));
        const newRecords      = enriched.filter(r => !existingIds.has(r.id as string));
        const existingRecords = enriched.filter(r =>  existingIds.has(r.id as string));

        if (newRecords.length) {
          const withFuente = fuente ? newRecords.map(r => ({ ...r, fuente })) : newRecords;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await sb.from(table).insert(withFuente as any[]);
          if (error) console.error(`[sheets-write] Supabase insert ${table}:`, error.message);
        }

        for (const rm of existingRecords) {
          // El ruteo (transporte/patente/ruta/conductor/supervisor) es dominio del Enrutador: al
          // re-registrar Bodega NO se toca, para no pisar lo que dejó el cierre del camión.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updateObj: Record<string, any> = {
            tipo: rm.tipo, carga: rm.carga, regimen: rm.regimen, tipo_comuna: rm.tipo_comuna,
            peso_kg: rm.peso_kg, alto: rm.alto, largo: rm.largo, ancho: rm.ancho, peso_v: rm.peso_v,
            ventana: rm.ventana, n_pallet_bulto: rm.n_pallet_bulto,
            ...(rm.fecha_armado    !== null && rm.fecha_armado    !== undefined && { fecha_armado:    rm.fecha_armado }),
            ...(rm.picking_slot_id !== null && rm.picking_slot_id !== undefined && { picking_slot_id: rm.picking_slot_id }),
          };
          if (fuente) updateObj.fuente = fuente;
          const { error } = await sb.from(table).update(updateObj).eq('id', rm.id as string);
          if (error) console.error(`[sheets-write] Supabase update ${table}:`, error.message);
        }

        return NextResponse.json({ ok: true, written: rows.length, respaldoReconciliado: idsABorrar.length });
      }
    }

    // ── DESPACHO CONGELADOS: bodega de congelados. SIEMPRE append+mirror (sin dims),
    //    con la tabla destino EXPLÍCITA (body.tabla) porque una sola hoja alimenta
    //    despacho_rm (RM/Costa) o despacho_regiones (Nacional) según el sub-tab. ──
    if (sheet === 'DESPACHO CONGELADOS') {
      const sb = supabaseServer();
      const tabla = body.tabla;
      if (tabla !== 'despacho_rm' && tabla !== 'despacho_regiones') {
        return NextResponse.json({ error: 'tabla inválida para DESPACHO CONGELADOS (debe ser despacho_rm o despacho_regiones)' }, { status: 400 });
      }
      const records = tabla === 'despacho_rm' ? rows.map(toRmRecord) : rows.map(toRegionesRecord);
      const fuenteCong = fuente ?? 'bodega_congelados';

      // Append SOLO filas nuevas a la hoja (idempotente por id en col A).
      const idColRes = await gs.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'DESPACHO CONGELADOS!A:A' });
      const sheetIdSet = new Set<string>((idColRes.data.values || []).map(r => String(r?.[0] ?? '')).filter(Boolean));
      const newSheetRows = rows.filter(r => !sheetIdSet.has(String(r[0])));
      if (newSheetRows.length > 0) {
        const appRes = await gs.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID, range: 'DESPACHO CONGELADOS!A1',
          valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
          requestBody: { values: newSheetRows },
        });
        // La fecha va en col B (índice 1); aplicar formato de fecha post-append.
        await applyDateFormat(gs, 'DESPACHO CONGELADOS', appRes.data.updates?.updatedRange, 1);
      }

      // Mirror a Supabase (tabla por región) con fuente='bodega_congelados'.
      const ids = records.map(r => r.id);
      const { data: existing } = await sb.from(tabla).select('id').in('id', ids);
      const existingIds = new Set((existing ?? []).map((e: { id: string }) => e.id));
      const newRecords = records.filter(r => !existingIds.has(r.id));
      const existingRecords = records.filter(r => existingIds.has(r.id));
      if (newRecords.length) {
        const withFuente = newRecords.map(r => ({ ...r, fuente: fuenteCong }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await sb.from(tabla).insert(withFuente as any[]);
        if (error) console.error('[sheets-write] Supabase insert congelados', tabla, error.message);
      }
      for (const r of existingRecords) {
        const rm = r as Record<string, unknown>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateObj: Record<string, any> = {
          tipo: rm.tipo, carga: rm.carga, regimen: rm.regimen,
          ventana: rm.ventana, estado: rm.estado, n_pallet_bulto: rm.n_pallet_bulto,
          fuente: fuenteCong,
          ...(rm.fecha_armado    !== null && rm.fecha_armado    !== undefined && { fecha_armado:    rm.fecha_armado }),
          ...(rm.picking_slot_id !== null && rm.picking_slot_id !== undefined && { picking_slot_id: rm.picking_slot_id }),
        };
        const { error } = await sb.from(tabla).update(updateObj).eq('id', r.id);
        if (error) console.error('[sheets-write] Supabase update congelados', tabla, error.message);
      }
      return NextResponse.json({ ok: true, written: rows.length });
    }

    // ── CONTROL DESPACHO: upsert by fecha::cod, update patente columns ──
    if (sheet === 'CONTROL DESPACHO') {
      const readRes = await gs.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range:         'CONTROL DESPACHO!A:G',
      });
      const sheetRows = readRes.data.values ?? [];
      const rowMap = new Map<string, number>();
      for (let i = 1; i < sheetRows.length; i++) {
        const r = sheetRows[i];
        if (r?.[0] && r?.[2]) rowMap.set(`${r[0]}::${r[2]}`, i + 1);
      }
      const updateData: { range: string; values: (string | number)[][] }[] = [];
      const newRows: (string | number)[][] = [];
      for (const row of rows) {
        const key = `${row[0]}::${row[2]}`;
        const v1  = row[5] != null ? String(row[5]) : '';
        const v2  = row[6] != null ? String(row[6]) : '';
        const existingRowNum = rowMap.get(key);
        if (existingRowNum) {
          if (v1) updateData.push({ range: `CONTROL DESPACHO!F${existingRowNum}`, values: [[v1]] });
          if (v2) updateData.push({ range: `CONTROL DESPACHO!G${existingRowNum}`, values: [[v2]] });
        } else {
          newRows.push(row);
        }
      }
      if (updateData.length > 0) {
        await gs.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody:   { valueInputOption: 'USER_ENTERED', data: updateData },
        });
      }
      if (newRows.length > 0) {
        const appendRes = await gs.spreadsheets.values.append({
          spreadsheetId:    SPREADSHEET_ID,
          range:            'CONTROL DESPACHO!A1',
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody:      { values: newRows },
        });
        // Fix: USER_ENTERED convierte "DD/MM/YYYY" a serial de fecha (p.ej. 46206).
        // Aplicar formato de fecha en col A de las filas recién insertadas.
        await applyDateFormat(gs, 'CONTROL DESPACHO', appendRes.data.updates?.updatedRange, 0);
      }
      return NextResponse.json({ ok: true, updated: updateData.length, appended: newRows.length });
    }

    // ── Other allowed sheets (HISTORIAL, RECEPCIÓN TIENDA, etc.) — always append ──
    const otherAppendRes = await gs.spreadsheets.values.append({
      spreadsheetId:    SPREADSHEET_ID,
      range:            `${sheet}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody:      { values: rows },
    });

    // Fix: USER_ENTERED convierte "DD/MM/YYYY" a serial de fecha (p.ej. 46206).
    // HISTORIAL escribe fechaDDMM en col A (índice 0). Aplicar formato de fecha post-append.
    if (sheet === 'HISTORIAL') {
      await applyDateFormat(gs, 'HISTORIAL', otherAppendRes.data.updates?.updatedRange, 0);
    }

    return NextResponse.json({ ok: true, written: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sheets-write]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
