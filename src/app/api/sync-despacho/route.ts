import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no configurado');
  const clean = raw.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
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

// DESPACHO RM/REGIONES — 26 cols (PATENTE insertada entre TRANSPORTE[6] y CARGA[8])
function toRmRecord(row: (string | number)[]) {
  return {
    id:             String(row[0]  ?? ''),
    fecha:          String(row[1]  ?? ''),
    cod:            String(row[2]  ?? ''),
    tienda:         String(row[3]  ?? ''),
    tipo:           String(row[4]  ?? ''),
    regimen:        String(row[5]  ?? ''),
    transporte:     String(row[6]  ?? ''),
    patente:        String(row[7]  ?? ''),
    carga:          String(row[8]  ?? ''),
    region:         String(row[9]  ?? ''),
    comuna:         String(row[10] ?? ''),
    tipo_comuna:    String(row[11] ?? ''),
    peso_kg:        num(row[12]),
    alto:           num(row[13]),
    largo:          num(row[14]),
    ancho:          num(row[15]),
    peso_v:         num(row[16]),
    ventana:        String(row[17] ?? ''),
    estado:         String(row[18] ?? ''),
    n_pallet_bulto: String(row[19] ?? ''),
    fecha_llegada:  String(row[20] ?? ''),
    conductor:      String(row[21] ?? ''),
    ruta:           String(row[22] ?? ''),
    supervisor:     String(row[23] ?? ''),
    pioneta_1:      row[26] ? String(row[26]) : null,
    pioneta_2:      row[27] ? String(row[27]) : null,
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
    patente:        String(row[7]  ?? ''),
    carga:          String(row[8]  ?? ''),
    region:         String(row[9]  ?? ''),
    comuna:         String(row[10] ?? ''),
    tipo_comuna:    String(row[11] ?? ''),
    peso_kg:        num(row[12]),
    alto:           num(row[13]),
    largo:          num(row[14]),
    ancho:          num(row[15]),
    peso_v:         num(row[16]),
    ventana:        String(row[17] ?? ''),
    estado:         String(row[18] ?? ''),
    n_pallet_bulto: String(row[19] ?? ''),
    fecha_llegada:  String(row[20] ?? ''),
    guia:           String(row[21] ?? ''),
    valor:          num(row[22]),
    seguimiento:    'Registrado',
  };
}

// POST /api/sync-despacho
// Reads DESPACHO RM and DESPACHO REGIONES from Google Sheets and upserts
// into Supabase. Uses ignoreDuplicates so existing seguimiento values are preserved.
export async function POST(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
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
