import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabaseServer } from '@/lib/supabaseServer';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no configurado');
  const clean = raw.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  return JSON.parse(clean);
}

async function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

function num(v: string | number | undefined): number | null {
  const p = parseFloat(String(v ?? ''));
  return isNaN(p) ? null : p;
}

function isDataRow(row: (string | number)[]): boolean {
  const id = String(row[0] ?? '').trim();
  return id !== '' && id.toLowerCase() !== 'id';
}

function toRmRecord(row: (string | number)[]) {
  return {
    id:             String(row[0]  ?? ''),
    fecha:          String(row[1]  ?? ''),
    cod:            String(row[2]  ?? ''),
    tienda:         String(row[3]  ?? ''),
    tipo:           String(row[4]  ?? ''),
    regimen:        String(row[5]  ?? ''),
    transporte:     String(row[6]  ?? ''),
    carga:          String(row[7]  ?? ''),
    region:         String(row[8]  ?? ''),
    comuna:         String(row[9]  ?? ''),
    tipo_comuna:    String(row[10] ?? ''),
    peso_kg:        num(row[11]),
    alto:           num(row[12]),
    largo:          num(row[13]),
    ancho:          num(row[14]),
    peso_v:         num(row[15]),
    ventana:        String(row[16] ?? ''),
    estado:         String(row[17] ?? ''),
    n_pallet_bulto: String(row[18] ?? ''),
    fecha_llegada:  String(row[19] ?? ''),
    conductor:      String(row[20] ?? ''),
    ruta:           String(row[21] ?? ''),
    supervisor:     String(row[22] ?? ''),
    seguimiento:    'Registrado',
  };
}

function toRegionesRecord(row: (string | number)[]) {
  return {
    id:             String(row[0]  ?? ''),
    fecha:          String(row[1]  ?? ''),
    cod:            String(row[2]  ?? ''),
    tienda:         String(row[3]  ?? ''),
    tipo:           String(row[4]  ?? ''),
    regimen:        String(row[5]  ?? ''),
    transporte:     String(row[6]  ?? ''),
    carga:          String(row[7]  ?? ''),
    region:         String(row[8]  ?? ''),
    comuna:         String(row[9]  ?? ''),
    tipo_comuna:    String(row[10] ?? ''),
    peso_kg:        num(row[11]),
    alto:           num(row[12]),
    largo:          num(row[13]),
    ancho:          num(row[14]),
    peso_v:         num(row[15]),
    ventana:        String(row[16] ?? ''),
    estado:         String(row[17] ?? ''),
    n_pallet_bulto: String(row[18] ?? ''),
    fecha_llegada:  String(row[19] ?? ''),
    guia:           String(row[20] ?? ''),
    valor:          num(row[21]),
    seguimiento:    'Registrado',
  };
}

// POST /api/sync-despacho
// Reads DESPACHO RM and DESPACHO REGIONES from Google Sheets and upserts
// into Supabase. Uses ignoreDuplicates so existing seguimiento values are preserved.
export async function POST() {
  try {
    const auth = await getAuth();
    const gs   = google.sheets({ version: 'v4', auth });
    const sb   = supabaseServer();

    const [rmResp, regResp] = await Promise.all([
      gs.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'DESPACHO RM' }),
      gs.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'DESPACHO REGIONES' }),
    ]);

    const rmRecords  = (rmResp.data.values  ?? []).filter(isDataRow).map(toRmRecord);
    const regRecords = (regResp.data.values ?? []).filter(isDataRow).map(toRegionesRecord);

    const errors: string[] = [];

    if (rmRecords.length > 0) {
      const { error } = await sb.from('despacho_rm')
        .upsert(rmRecords, { onConflict: 'id', ignoreDuplicates: true });
      if (error) errors.push(`RM: ${error.message}`);
    }

    if (regRecords.length > 0) {
      const { error } = await sb.from('despacho_regiones')
        .upsert(regRecords, { onConflict: 'id', ignoreDuplicates: true });
      if (error) errors.push(`Regiones: ${error.message}`);
    }

    return NextResponse.json({
      ok:      errors.length === 0,
      rm:      rmRecords.length,
      regiones: regRecords.length,
      errors,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
