import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabaseServer } from '@/lib/supabaseServer';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';
const SHEET_TIENDAS  = 'TIENDAS';

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

interface TiendaRow {
  codigo: string; nombre: string; direccion: string; region: string;
  sector_comuna: string; corredor: string; tipo: string; ventana: string;
  frecuencia: string; prom_por_dia: string; lat: number | null; lon: number | null;
  correos: string; tel_encargado: string; supervisor: string;
  tel_supervisor: string; transportista: string; activo: boolean;
}

export async function POST() {
  try {
    // 1. Read all tiendas from Supabase
    const sb = supabaseServer();
    const { data: tiendas, error } = await sb
      .from('tiendas')
      .select('*')
      .order('codigo');
    if (error) throw error;

    if (!tiendas || tiendas.length === 0) {
      return NextResponse.json({ ok: true, exported: 0 });
    }

    // 2. Connect to Sheets
    const auth = await getAuth();
    const gs   = google.sheets({ version: 'v4', auth });

    // 3. Find header row (or write one if missing)
    const readRes = await gs.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range:         `${SHEET_TIENDAS}!A1:R1`,
    });
    const header = readRes.data.values?.[0];
    const hasHeader = header && String(header[0]).trim().toUpperCase() === 'CÓDIGO';

    let dataStartRow: number;

    if (!hasHeader) {
      // Write header first
      await gs.spreadsheets.values.update({
        spreadsheetId:    SPREADSHEET_ID,
        range:            `${SHEET_TIENDAS}!A1:R1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['CÓDIGO','NOMBRE','DIRECCIÓN','REGIÓN','SECTOR/COMUNA','CORREDOR','TIPO','VENTANA','FRECUENCIA','PROM P/DÍA','LAT','LON','CORREOS','TEL ENCARGADO','SUPERVISOR','TEL SUPERVISOR','TRANSPORTISTA','ACTIVO']],
        },
      });
      dataStartRow = 2;
    } else {
      dataStartRow = 2;
    }

    // 4. Clear existing data rows (keep header)
    const lastDataRow = dataStartRow + tiendas.length + 50; // buffer for old rows
    await gs.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range:         `${SHEET_TIENDAS}!A${dataStartRow}:R${lastDataRow}`,
    });

    // 5. Write all tiendas
    const rows = (tiendas as TiendaRow[]).map(t => [
      t.codigo        ?? '',
      t.nombre        ?? '',
      t.direccion     ?? '',
      t.region        ?? '',
      t.sector_comuna ?? '',
      t.corredor      ?? '',
      t.tipo          ?? '',
      t.ventana       ?? '',
      t.frecuencia    ?? '',
      t.prom_por_dia  ?? '',
      t.lat  != null  ? String(t.lat)  : '',
      t.lon  != null  ? String(t.lon)  : '',
      t.correos       ?? '',
      t.tel_encargado ?? '',
      t.supervisor    ?? '',
      t.tel_supervisor ?? '',
      t.transportista ?? '',
      t.activo !== false ? 'TRUE' : 'FALSE',
    ]);

    await gs.spreadsheets.values.update({
      spreadsheetId:    SPREADSHEET_ID,
      range:            `${SHEET_TIENDAS}!A${dataStartRow}:R${dataStartRow + rows.length - 1}`,
      valueInputOption: 'RAW',
      requestBody:      { values: rows },
    });

    return NextResponse.json({ ok: true, exported: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/tiendas/export-sheets]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
