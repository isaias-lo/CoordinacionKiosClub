import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabaseServer } from '@/lib/supabaseServer';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';
const SHEET_TIENDAS  = 'TIENDAS';

const TITLE_TEXT = '⚡ TIENDAS — KiosClub CD | Agregar tiendas nuevas al final | Presionar \'Actualizar datos\' en el sistema para reflejar cambios';

const HEADERS = ['CÓDIGO','NOMBRE','DIRECCIÓN','REGIÓN','SECTOR/COMUNA','CORREDOR','TIPO','VENTANA','FRECUENCIA','PROM P/DÍA','LAT','LON','CORREOS','TEL ENCARGADO','SUPERVISOR','TEL SUPERVISOR','TRANSPORTISTA','ACTIVO'];

// Sort order: RM → Valparaíso (Costa) → Coquimbo → Antofagasta → O'Higgins → Maule → Ñuble → Biobío → Araucanía → Los Ríos → Los Lagos
const REGION_ORDER: Record<string, number> = {
  'RM': 0,
  'Valparaíso': 1,
  'Coquimbo': 2,
  'Antofagasta': 3,
  "O'Higgins": 4,
  'Maule': 5,
  'Ñuble': 6,
  'Biobío': 7,
  'Araucanía': 8,
  'Los Ríos': 9,
  'Los Lagos': 10,
};

function regionOrder(region: string | null | undefined): number {
  if (!region) return 99;
  return REGION_ORDER[region] ?? 99;
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
      .select('*');
    if (error) throw error;

    if (!tiendas || tiendas.length === 0) {
      return NextResponse.json({ ok: true, exported: 0 });
    }

    // 2. Sort by region order, then by código within each region
    const sorted = (tiendas as TiendaRow[]).slice().sort((a, b) => {
      const ro = regionOrder(a.region) - regionOrder(b.region);
      if (ro !== 0) return ro;
      return (a.codigo ?? '').localeCompare(b.codigo ?? '');
    });

    // 3. Connect to Sheets
    const auth = await getAuth();
    const gs   = google.sheets({ version: 'v4', auth });

    // 4. Get sheet ID for formatting
    const spreadsheet = await gs.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === SHEET_TIENDAS);
    const sheetId = sheet?.properties?.sheetId ?? 0;

    const numCols = HEADERS.length; // 18

    // 5. Unmerge + re-merge title row
    await gs.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            unmergeCells: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numCols },
            },
          },
          {
            mergeCells: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numCols },
              mergeType: 'MERGE_ALL',
            },
          },
        ],
      },
    });

    // 6. Clear rows 3 onwards (keep rows 1-2 for title + header)
    const lastRow = 3 + sorted.length + 50;
    await gs.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_TIENDAS}!A3:R${lastRow}`,
    });

    // 7. Write title (row 1), headers (row 2), data (row 3+)
    const dataRows = sorted.map(t => [
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

    await gs.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: `${SHEET_TIENDAS}!A1`, values: [[TITLE_TEXT]] },
          { range: `${SHEET_TIENDAS}!A2:R2`, values: [HEADERS] },
          { range: `${SHEET_TIENDAS}!A3:R${2 + dataRows.length}`, values: dataRows },
        ],
      },
    });

    return NextResponse.json({ ok: true, exported: dataRows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/tiendas/export-sheets]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
