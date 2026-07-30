import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { isDataRow, makeRmMapper, makeRegionesMapper, missingHeaders, RM_HEADERS, REGIONES_HEADERS } from './parseRows';

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

// DESPACHO RM/REGIONES ahora se leen por NOMBRE de encabezado (ver ./parseRows), no por
// posición → las columnas se pueden reordenar sin cruzar datos.

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

    // La 1ª fila es el encabezado → mapeo por nombre; el resto son filas de datos.
    const rmValues  = rmResp.data.values  ?? [];
    const regValues = regResp.data.values ?? [];

    // Aviso si alguna columna esperada cambió de nombre (esos campos caerían a fallback posicional).
    const rmMiss  = missingHeaders(rmValues[0]  ?? [], RM_HEADERS);
    const regMiss = missingHeaders(regValues[0] ?? [], REGIONES_HEADERS);
    if (rmMiss.length)  console.warn('[sync-despacho] DESPACHO RM: encabezados no encontrados (fallback posicional):', rmMiss);
    if (regMiss.length) console.warn('[sync-despacho] DESPACHO REGIONES: encabezados no encontrados (fallback posicional):', regMiss);

    const rmRecords  = rmValues.filter(isDataRow).map(makeRmMapper(rmValues[0] ?? []));
    const regRecords = regValues.filter(isDataRow).map(makeRegionesMapper(regValues[0] ?? []));

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
