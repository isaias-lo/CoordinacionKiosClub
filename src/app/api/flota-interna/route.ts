import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { verifyAuth } from '@/lib/apiAuth';
import { SALIDA_SHEET, SALIDA_HEADERS, buildSalidaRow, type SalidaVehiculo } from '@/features/despacho/rutas/utils/flotaInterna';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';
export const maxDuration = 20;

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no configurado');
  const clean = raw.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  return JSON.parse(clean);
}
async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

type GSheets = Awaited<ReturnType<typeof getSheets>>;

/** Asegura que la hoja SALIDA VEHICULOS exista (con su fila de encabezados). */
async function ensureSheet(gs: GSheets): Promise<void> {
  const meta = await gs.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets.properties(title)' });
  const exists = (meta.data.sheets ?? []).some(s => s.properties?.title === SALIDA_SHEET);
  if (exists) return;
  await gs.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: SALIDA_SHEET } } }] },
  });
  await gs.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SALIDA_SHEET}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [SALIDA_HEADERS] },
  });
}

// ── GET: últimas salidas registradas (para el log del panel) ──────────────────
export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const gs = await getSheets();
    const res = await gs.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SALIDA_SHEET}!A2:L` });
    const rows = (res.data.values ?? []) as string[][];
    const salidas = rows
      .filter(r => r.some(c => (c ?? '').trim()))
      .map(r => Object.fromEntries(SALIDA_HEADERS.map((h, i) => [h, r[i] ?? ''])))
      .reverse()
      .slice(0, 30);
    return NextResponse.json({ salidas });
  } catch {
    // La hoja aún no existe → sin salidas.
    return NextResponse.json({ salidas: [] });
  }
}

// ── POST: registrar una salida (1 fila) ───────────────────────────────────────
export async function POST(request: NextRequest) {
  if (!await verifyAuth(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const body = await request.json() as SalidaVehiculo;
    if (!body?.conductor?.trim() || !body?.vehiculo?.trim())
      return NextResponse.json({ error: 'Conductor y vehículo son requeridos' }, { status: 400 });
    if (!Array.isArray(body.paradas) || body.paradas.filter(p => p?.ref?.trim()).length === 0)
      return NextResponse.json({ error: 'Agrega al menos una parada' }, { status: 400 });

    const gs = await getSheets();
    await ensureSheet(gs);
    const row = buildSalidaRow(body, new Date().toISOString());
    await gs.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SALIDA_SHEET}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/flota-interna]', err);
    return NextResponse.json({ error: 'No se pudo registrar la salida' }, { status: 500 });
  }
}
