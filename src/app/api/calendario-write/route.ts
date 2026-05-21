import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';
const SHEET_NAME = 'CALENDARIO';
const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA'];

type CalRecord = Record<string, { rm: string[]; costa: string[]; fal: string[] }>;

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
    const { calendario } = await request.json() as { calendario: CalRecord };
    if (!calendario) {
      return NextResponse.json({ error: 'calendario requerido' }, { status: 400 });
    }

    const auth = await getAuth();
    const gs = google.sheets({ version: 'v4', auth });

    // Read sheet to find GRUPO header row
    const readRes = await gs.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:H100`,
    });

    const values = readRes.data.values || [];
    let headerRowIdx = -1;
    for (let i = 0; i < values.length; i++) {
      if (String(values[i]?.[0] || '').trim() === 'GRUPO') {
        headerRowIdx = i;
        break;
      }
    }

    // Build data rows: rm, costa, fal (reader auto-classifies codes by COSTA_CODES/FAL_CODES)
    const rmRow   = ['RM',    'RM',       ...DIAS.map(d => (calendario[d]?.rm    || []).join(' '))];
    const costaRow= ['COSTA', 'Costa',    ...DIAS.map(d => (calendario[d]?.costa || []).join(' '))];
    const falRow  = ['FAL',   'Regiones', ...DIAS.map(d => (calendario[d]?.fal   || []).join(' '))];

    let startRow: number; // 1-indexed sheet row for first data row

    if (headerRowIdx >= 0) {
      startRow = headerRowIdx + 2; // row after GRUPO header (1-indexed)

      // Clear up to 10 rows after GRUPO to remove stale data
      // (stops at 📦/FLOTA rows to preserve fleet data below)
      let clearEnd = startRow;
      for (let i = headerRowIdx + 1; i < Math.min(headerRowIdx + 11, values.length); i++) {
        const c0 = String(values[i]?.[0] || '');
        if (c0.includes('📦') || c0.toUpperCase().includes('FLOTA')) break;
        clearEnd = i + 1; // 1-indexed inclusive
      }
      if (clearEnd >= startRow) {
        await gs.spreadsheets.values.clear({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A${startRow}:H${clearEnd}`,
        });
      }
    } else {
      // No GRUPO header found — write fresh structure at top
      const headerRow = ['GRUPO', 'DESCRIPCIÓN', ...DIAS];
      await gs.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1:H1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headerRow] },
      });
      startRow = 2;
    }

    // Write 3 data rows
    await gs.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${startRow}:H${startRow + 2}`,
      valueInputOption: 'RAW',
      requestBody: { values: [rmRow, costaRow, falRow] },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[calendario-write]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
