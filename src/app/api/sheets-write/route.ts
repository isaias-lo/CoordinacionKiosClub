import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabaseServer } from '@/lib/supabaseServer';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

const ALLOWED_SHEETS = new Set(['DESPACHO REGIONES', 'DESPACHO RM', 'RECEPCIÓN TIENDA']);

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

function n(v: string | number): number | string {
  if (typeof v === 'number') return v;
  const parsed = parseFloat(v);
  return isNaN(parsed) ? v : parsed;
}

function toRmRecord(row: (string | number)[]) {
  return {
    id:               String(row[0]  ?? ''),
    fecha:            String(row[1]  ?? ''),
    cod:              String(row[2]  ?? ''),
    tienda:           String(row[3]  ?? ''),
    tipo:             String(row[4]  ?? ''),
    regimen:          String(row[5]  ?? ''),
    transporte:       String(row[6]  ?? ''),
    carga:            String(row[7]  ?? ''),
    region:           String(row[8]  ?? ''),
    comuna:           String(row[9]  ?? ''),
    tipo_comuna:      String(row[10] ?? ''),
    peso_kg:          n(row[11] ?? ''),
    alto:             n(row[12] ?? ''),
    largo:            n(row[13] ?? ''),
    ancho:            n(row[14] ?? ''),
    peso_v:           n(row[15] ?? ''),
    ventana:          String(row[16] ?? ''),
    estado:           String(row[17] ?? ''),
    n_pallet_bulto:   String(row[18] ?? ''),
    fecha_llegada:    String(row[19] ?? ''),
    conductor:        String(row[20] ?? ''),
    ruta:             String(row[21] ?? ''),
    supervisor:       String(row[22] ?? ''),
    estado_recepcion: 'Pendiente',
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
    carga:            String(row[7]  ?? ''),
    region:           String(row[8]  ?? ''),
    comuna:           String(row[9]  ?? ''),
    tipo_comuna:      String(row[10] ?? ''),
    peso_kg:          n(row[11] ?? ''),
    alto:             n(row[12] ?? ''),
    largo:            n(row[13] ?? ''),
    ancho:            n(row[14] ?? ''),
    peso_v:           n(row[15] ?? ''),
    ventana:          String(row[16] ?? ''),
    estado:           String(row[17] ?? ''),
    n_pallet_bulto:   String(row[18] ?? ''),
    fecha_llegada:    String(row[19] ?? ''),
    guia:             String(row[20] ?? ''),
    valor:            n(row[21] ?? ''),
    estado_recepcion: 'Pendiente',
  };
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

    const auth = await getAuth();
    const gs   = google.sheets({ version: 'v4', auth });

    await gs.spreadsheets.values.append({
      spreadsheetId:    SPREADSHEET_ID,
      range:            `${sheet}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody:      { values: rows },
    });

    // Mirror to Supabase
    if (sheet === 'DESPACHO RM' || sheet === 'DESPACHO REGIONES') {
      const sb      = supabaseServer();
      const table   = sheet === 'DESPACHO RM' ? 'despacho_rm' : 'despacho_regiones';
      const records = sheet === 'DESPACHO RM'
        ? rows.map(toRmRecord)
        : rows.map(toRegionesRecord);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await sb.from(table).upsert(records as any[], { onConflict: 'id' });
      if (error) console.error(`[sheets-write] Supabase ${table}:`, error.message);
    }

    return NextResponse.json({ ok: true, written: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sheets-write]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
