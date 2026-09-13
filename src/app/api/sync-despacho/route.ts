import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { isDataRow, makeRmMapper, makeRegionesMapper, missingHeaders, RM_HEADERS, REGIONES_HEADERS } from './parseRows';
import { repartirCongelados } from './congelados';
import { isRegionesCod } from '@/features/despacho/regiones/data/tiendas';
import { getTiendaSantiagoByCod } from '@/features/despacho/santiago/data/tiendasSantiago';

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

/** Una hoja que todavía no existe no es un error: se sincroniza lo que sí está. */
async function leerHoja(gs: ReturnType<typeof google.sheets>, range: string): Promise<(string | number)[][]> {
  try {
    const r = await gs.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
    return (r.data.values ?? []) as (string | number)[][];
  } catch (err) {
    console.warn(`[sync-despacho] no se pudo leer "${range}":`, err instanceof Error ? err.message : err);
    return [];
  }
}

// POST /api/sync-despacho
// Reads DESPACHO RM, DESPACHO REGIONES and DESPACHO CONGELADOS from Google Sheets and upserts
// into Supabase. Uses ignoreDuplicates so existing seguimiento values are preserved.
export async function POST(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const auth = await getAuth();
    const gs   = google.sheets({ version: 'v4', auth });
    const sb   = supabaseServer();

    // La 1ª fila es el encabezado → mapeo por nombre; el resto son filas de datos.
    const [rmValues, regValues, congValues] = await Promise.all([
      leerHoja(gs, 'DESPACHO RM'),
      leerHoja(gs, 'DESPACHO REGIONES'),
      leerHoja(gs, 'DESPACHO CONGELADOS'),
    ]);

    // Aviso si alguna columna esperada cambió de nombre (esos campos caerían a fallback posicional).
    const rmMiss  = missingHeaders(rmValues[0]  ?? [], RM_HEADERS);
    const regMiss = missingHeaders(regValues[0] ?? [], REGIONES_HEADERS);
    if (rmMiss.length)  console.warn('[sync-despacho] DESPACHO RM: encabezados no encontrados (fallback posicional):', rmMiss);
    if (regMiss.length) console.warn('[sync-despacho] DESPACHO REGIONES: encabezados no encontrados (fallback posicional):', regMiss);

    const rmRecords  = rmValues.filter(isDataRow).map(makeRmMapper(rmValues[0] ?? []));
    const regRecords = regValues.filter(isDataRow).map(makeRegionesMapper(regValues[0] ?? []));

    // ── DESPACHO CONGELADOS: una hoja, dos tablas ──────────────────────────────
    // La hoja usa los mismos encabezados que DESPACHO RM (se creó copiándolos), así que se parsea
    // con el mapper de RM. Lo que cambia es el destino: cada fila va a la tabla de su catálogo.
    // Sin esto, la hoja sería el ÚNICO lugar donde viven esos datos y la base dependería solo del
    // espejo directo — que es justo lo que falló durante meses (PR #492).
    const congRecords = congValues.filter(isDataRow).map(makeRmMapper(congValues[0] ?? []));
    const cong = repartirCongelados(
      congRecords,
      cod => isRegionesCod(cod),
      cod => getTiendaSantiagoByCod(cod) !== undefined,
    );
    if (cong.huerfanos.length) {
      console.warn('[sync-despacho] congelados sin catálogo (no se sincronizan):', [...new Set(cong.huerfanos)]);
    }

    const errors: string[] = [];

    const todosRm  = [...rmRecords,  ...cong.rm];
    const todosReg = [...regRecords, ...cong.regiones];

    if (todosRm.length > 0) {
      const { error } = await sb.from('despacho_rm')
        .upsert(todosRm, { onConflict: 'id', ignoreDuplicates: true });
      if (error) errors.push(`RM: ${error.message}`);
    }

    if (todosReg.length > 0) {
      const { error } = await sb.from('despacho_regiones')
        .upsert(todosReg, { onConflict: 'id', ignoreDuplicates: true });
      if (error) errors.push(`Regiones: ${error.message}`);
    }

    return NextResponse.json({
      ok:      errors.length === 0,
      rm:      rmRecords.length,
      regiones: regRecords.length,
      congelados: { rm: cong.rm.length, regiones: cong.regiones.length, huerfanos: cong.huerfanos.length },
      errors,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
