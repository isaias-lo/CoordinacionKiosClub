import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { verifyAdmin } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';
const SHEET_FLOTA    = 'FLOTA';

const TITLE_TEXT = '⚡ FLOTA — Editar capacidad, tipo, estado. PORTÓN: SI/NO | ES_TLBD=SI → furgón 2da vuelta';
const HEADERS    = ['PATENTE','CAPACIDAD P','CAPACIDAD B','TIPO','PORTÓN HIDRÁULICO','SISTEMA DE REFRIGERADO','ACTIVO DEFAULT','ES TLBD','EMPRESA','PIONETA 1','PIONETA 2'];
const LAST_COL   = 'K'; // 11 columns → A..K

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

export async function POST(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  try {
    const sb = supabaseServer();

    // 1. All active vehicles
    const { data: vehiculos, error: vErr } = await sb
      .from('flota_vehiculos')
      .select('patente,capacidad_p,capacidad_b,tipo,porton,refrigerado,activo,es_tlbd,empresa')
      .eq('activo', true)
      .order('created_at', { ascending: true });
    if (vErr) throw vErr;
    if (!vehiculos || vehiculos.length === 0) return NextResponse.json({ ok: true, exported: 0 });

    // 2. Most recent pioneta assignment per vehicle from rutas_despacho
    const patentes = vehiculos.map((v: { patente: string }) => v.patente);
    const { data: rutas } = await sb
      .from('rutas_despacho')
      .select('patente,pioneta_1,pioneta_2')
      .in('patente', patentes)
      .order('fecha', { ascending: false })
      .limit(patentes.length * 5);

    const pionetaMap: Record<string, { p1: string; p2: string }> = {};
    for (const r of (rutas ?? []) as { patente: string; pioneta_1: string | null; pioneta_2: string | null }[]) {
      if (!r.patente || pionetaMap[r.patente]) continue;
      pionetaMap[r.patente] = { p1: r.pioneta_1 ?? '', p2: r.pioneta_2 ?? '' };
    }

    // 3. Connect to Sheets
    const auth = await getAuth();
    const gs   = google.sheets({ version: 'v4', auth });

    const spreadsheet = await gs.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheet   = spreadsheet.data.sheets?.find(s => s.properties?.title === SHEET_FLOTA);
    const sheetId = sheet?.properties?.sheetId ?? 0;

    // 4. Unmerge (use wide range to cover any previous merge regardless of column count) + re-merge
    await gs.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          { unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 26 } } },
          { mergeCells:   { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: HEADERS.length }, mergeType: 'MERGE_ALL' } },
        ],
      },
    });

    // 5. Clear data rows (keep rows 1-2: title + header)
    const lastRow = 3 + vehiculos.length + 20;
    await gs.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_FLOTA}!A3:${LAST_COL}${lastRow}`,
    });

    // 6. Write title, headers, data
    const dataRows = (vehiculos as {
      patente: string; capacidad_p: number; capacidad_b: number; tipo: string;
      porton: boolean | null; refrigerado: boolean; activo: boolean; es_tlbd: boolean;
      empresa: string;
    }[]).map(v => {
      const pio = pionetaMap[v.patente] ?? { p1: '', p2: '' };
      return [
        v.patente     ?? '',
        v.capacidad_p ?? '',
        v.capacidad_b ?? '',
        v.tipo        ?? '',
        v.porton === true ? 'SI' : 'NO',
        v.refrigerado ? 'SI' : 'NO',
        v.activo      ? 'SI' : 'NO',
        v.es_tlbd     ? 'SI' : 'NO',
        v.empresa     ?? '',
        pio.p1,
        pio.p2,
      ];
    });

    await gs.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: `${SHEET_FLOTA}!A1`,                                    values: [[TITLE_TEXT]] },
          { range: `${SHEET_FLOTA}!A2:${LAST_COL}2`,                       values: [HEADERS]      },
          { range: `${SHEET_FLOTA}!A3:${LAST_COL}${2 + dataRows.length}`,  values: dataRows       },
        ],
      },
    });

    return NextResponse.json({ ok: true, exported: dataRows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/flota/export-sheets]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
