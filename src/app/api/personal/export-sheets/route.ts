import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabaseServer } from '@/lib/supabaseServer';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

const HEADERS_CONDUCTORES = ['NOMBRE', 'TELÉFONO', 'EMPRESA'];
const HEADERS_PIONETAS    = ['NOMBRE', 'TELÉFONO', 'EMPRESA'];

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no configurado');
  const clean = raw.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  return JSON.parse(clean) as object;
}

async function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function ensureSheet(gs: ReturnType<typeof google.sheets>, spreadsheetId: string, title: string): Promise<number> {
  const meta = await gs.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find(s => s.properties?.title === title);
  if (existing?.properties?.sheetId != null) return existing.properties.sheetId;

  const res = await gs.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });
  return res.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
}

async function writePersonalSheet(
  gs: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  sheetName: string,
  sheetId: number,
  headers: string[],
  rows: (string | null)[][],
  titleText: string,
) {
  const lastCol = String.fromCharCode(64 + headers.length);

  await gs.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 26 } } },
        { mergeCells:   { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length }, mergeType: 'MERGE_ALL' } },
      ],
    },
  });

  const lastRow = 3 + rows.length + 10;
  await gs.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetName}!A3:${lastCol}${lastRow}`,
  });

  await gs.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: `${sheetName}!A1`,                               values: [[titleText]] },
        { range: `${sheetName}!A2:${lastCol}2`,                   values: [headers]    },
        ...(rows.length > 0 ? [{ range: `${sheetName}!A3:${lastCol}${2 + rows.length}`, values: rows }] : []),
      ],
    },
  });
}

export async function POST() {
  try {
    const sb = supabaseServer();

    const [{ data: conductores }, { data: pionetas }] = await Promise.all([
      sb.from('conductores').select('nombre, telefono, empresa').eq('activo', true).order('nombre'),
      sb.from('pionetas').select('nombre, telefono, empresa').eq('activo', true).order('nombre'),
    ]);

    const auth = await getAuth();
    const gs   = google.sheets({ version: 'v4', auth });

    const [idConductores, idPionetas] = await Promise.all([
      ensureSheet(gs, SPREADSHEET_ID, 'CONDUCTORES'),
      ensureSheet(gs, SPREADSHEET_ID, 'PIONETAS'),
    ]);

    const rowsConductores = (conductores ?? []).map(c => [c.nombre ?? '', c.telefono ?? '', c.empresa ?? '']);
    const rowsPionetas    = (pionetas    ?? []).map(p => [p.nombre ?? '', p.telefono ?? '', p.empresa ?? '']);

    await Promise.all([
      writePersonalSheet(gs, SPREADSHEET_ID, 'CONDUCTORES', idConductores, HEADERS_CONDUCTORES, rowsConductores,
        '👤 CONDUCTORES — Catálogo de conductores activos'),
      writePersonalSheet(gs, SPREADSHEET_ID, 'PIONETAS', idPionetas, HEADERS_PIONETAS, rowsPionetas,
        '🧑‍🤝‍🧑 PIONETAS — Catálogo de pionetas activos'),
    ]);

    return NextResponse.json({ ok: true, conductores: rowsConductores.length, pionetas: rowsPionetas.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/personal/export-sheets]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
