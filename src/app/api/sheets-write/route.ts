import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

const ALLOWED_SHEETS = new Set(['DESPACHO REGIONES', 'DESPACHO RM']);

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no configurado');
  const clean = raw.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  return JSON.parse(clean);
}

async function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export async function POST(request: NextRequest) {
  try {
    const { sheet, rows } = await request.json() as { sheet: string; rows: (string | number)[][] };

    if (!ALLOWED_SHEETS.has(sheet)) {
      return NextResponse.json({ error: `Hoja no permitida: ${sheet}` }, { status: 400 });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'rows vacío' }, { status: 400 });
    }

    const auth  = await getAuth();
    const gs    = google.sheets({ version: 'v4', auth });

    await gs.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range:         `${sheet}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });

    return NextResponse.json({ ok: true, written: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sheets-write]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
