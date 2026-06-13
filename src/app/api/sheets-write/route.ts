import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/apiAuth';
import { google } from 'googleapis';
import { supabaseServer } from '@/lib/supabaseServer';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

const ALLOWED_SHEETS = new Set(['DESPACHO REGIONES', 'DESPACHO RM', 'RECEPCIÓN TIENDA', 'HISTORIAL', 'CONTROL DESPACHO']);

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
    canonical_id:     row[29] ? String(row[29]) : null,
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
    canonical_id:     row[29] ? String(row[29]) : null,
    seguimiento: 'Registrado',
  };
}

export async function POST(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const body = await request.json() as { sheet: string; rows?: (string | number)[][]; fuente?: string; action?: string; items?: unknown[] };
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

        return NextResponse.json({ ok: true, updated: updateData.length > 0 ? seenSheets.size : 0 });

      } else {
        // ── Bodega path: append new rows to Sheets + upsert Supabase ──
        await gs.spreadsheets.values.append({
          spreadsheetId:    SPREADSHEET_ID,
          range:            `${sheet}!A1`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody:      { values: rows },
        });

        const ids = records.map(r => r.id);
        const { data: existing } = await sb.from(table).select('id').in('id', ids);
        const existingIds = new Set((existing ?? []).map((e: { id: string }) => e.id));
        const newRecords      = records.filter(r => !existingIds.has(r.id));
        const existingRecords = records.filter(r =>  existingIds.has(r.id));

        if (newRecords.length) {
          const withFuente = fuente ? newRecords.map(r => ({ ...r, fuente })) : newRecords;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await sb.from(table).insert(withFuente as any[]);
          if (error) console.error(`[sheets-write] Supabase insert ${table}:`, error.message);
        }

        for (const r of existingRecords) {
          const rm = r as Record<string, unknown>;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updateObj: Record<string, any> = {
            tipo: rm.tipo, carga: rm.carga, regimen: rm.regimen, transporte: rm.transporte,
            tipo_comuna: rm.tipo_comuna,
            peso_kg: rm.peso_kg, alto: rm.alto, largo: rm.largo, ancho: rm.ancho, peso_v: rm.peso_v,
            ventana: rm.ventana, estado: rm.estado, n_pallet_bulto: rm.n_pallet_bulto,
            ...(rm.fecha_armado  !== null && rm.fecha_armado  !== undefined && { fecha_armado:  rm.fecha_armado }),
            ...(rm.canonical_id  !== null && rm.canonical_id  !== undefined && { canonical_id:  rm.canonical_id }),
          };
          if (fuente) updateObj.fuente = fuente;
          const { error } = await sb.from(table).update(updateObj).eq('id', r.id);
          if (error) console.error(`[sheets-write] Supabase update ${table}:`, error.message);
        }

        return NextResponse.json({ ok: true, written: rows.length });
      }
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
        await gs.spreadsheets.values.append({
          spreadsheetId:    SPREADSHEET_ID,
          range:            'CONTROL DESPACHO!A1',
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody:      { values: newRows },
        });
      }
      return NextResponse.json({ ok: true, updated: updateData.length, appended: newRows.length });
    }

    // ── Other allowed sheets (RECEPCIÓN TIENDA etc.) — always append ──
    await gs.spreadsheets.values.append({
      spreadsheetId:    SPREADSHEET_ID,
      range:            `${sheet}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody:      { values: rows },
    });

    return NextResponse.json({ ok: true, written: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sheets-write]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
