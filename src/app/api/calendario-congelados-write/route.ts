import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/apiAuth';
import { google } from 'googleapis';
import type { sheets_v4 } from 'googleapis';
import { serializeCongeladosSheet } from '@/features/control-interno/utils/congeladosSheet';
import type { CalRecord } from '@/lib/calendarioCongeladosSync';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';
const SHEET_NAME = 'CALENDARIO CONG.';

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

type GSheets = sheets_v4.Sheets;

/**
 * Asegura que la hoja "CALENDARIO CONG." exista. Si no existe, la crea (vacía) —
 * NO escribe título/encabezados/columna A: esta ruta solo respalda columnas B..H,
 * el resto de la hoja (título, "No.") se administra a mano en Sheets.
 */
async function ensureSheet(gs: GSheets): Promise<void> {
  const meta = await gs.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets.properties(title)' });
  const exists = (meta.data.sheets ?? []).some(s => s.properties?.title === SHEET_NAME);
  if (exists) return;
  await gs.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
  });
}

export async function POST(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  try {
    const { calendario } = await request.json() as { calendario: CalRecord };
    if (!calendario) return NextResponse.json({ error: 'calendario requerido' }, { status: 400 });

    const { headerRow, dataRows, numRows } = serializeCongeladosSheet(calendario);

    const auth = await getAuth();
    const gs = google.sheets({ version: 'v4', auth });

    await ensureSheet(gs);

    // Encabezados de días (fila 2, B2:H2) — LUNES..DOMINGO. NO toca A2 ("No.").
    await gs.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!B2:H2`,
      valueInputOption: 'RAW',
      requestBody: { values: [headerRow] },
    });

    // Limpia solo el rango de datos de días (B3:H1000) — NUNCA la columna A (números
    // "No." ya existentes) ni la fila de título.
    await gs.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!B3:H1000`,
    });

    if (numRows > 0) {
      await gs.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          valueInputOption: 'RAW',
          data: [{ range: `${SHEET_NAME}!B3:H${2 + numRows}`, values: dataRows }],
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[calendario-congelados-write]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
