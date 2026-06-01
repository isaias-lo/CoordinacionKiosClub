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

function n(v: string | number): number | null {
  if (typeof v === 'number') return v;
  const parsed = parseFloat(String(v));
  return isNaN(parsed) ? null : parsed;
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
    guia:             String(row[23] ?? ''),
    valor:            n(row[24] ?? ''),
    pioneta_1:        row[25] ? String(row[25]) : null,
    pioneta_2:        row[26] ? String(row[26]) : null,
    seguimiento: 'Registrado',
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
    conductor:        String(row[20] ?? ''),
    ruta:             String(row[21] ?? ''),
    supervisor:       String(row[22] ?? ''),
    guia:             String(row[23] ?? ''),
    valor:            n(row[24] ?? ''),
    pioneta_1:        row[25] ? String(row[25]) : null,
    pioneta_2:        row[26] ? String(row[26]) : null,
    seguimiento: 'Registrado',
  };
}

export async function POST(request: NextRequest) {
  try {
    const { sheet, rows, fuente } = await request.json() as { sheet: string; rows: (string | number)[][]; fuente?: string };

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

      // Enrutador sends no dimension data; Bodega (Santiago / Regiones) sends dimensions.
      const hasDims = records.some(r => (r as Record<string,unknown>).peso_kg !== null);

      if (!hasDims) {
        // Enrutador: bulk-update routing fields for all records with matching (fecha, cod).
        // IDs from Enrutador differ from Picking/Bodega IDs, so match by date + store code.
        const seen = new Set<string>();
        for (const r of records) {
          const key = `${r.fecha}::${r.cod}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const rm = r as Record<string, unknown>;
          const { error } = await sb.from(table)
            .update({ conductor: rm.conductor, ruta: rm.ruta, supervisor: rm.supervisor,
                      transporte: rm.transporte, estado: rm.estado, ventana: rm.ventana })
            .eq('fecha', r.fecha)
            .eq('cod', r.cod)
            .eq('conductor_modificado', false); // guard: never overwrite manual reassignments
          if (error) console.error(`[sheets-write] Supabase update ${table}:`, error.message);
        }
      } else {
        // Bodega: insert new records; update existing (Picking-created) records with confirmed dims.
        const ids = records.map(r => r.id);
        const { data: existing } = await sb.from(table).select('id').in('id', ids);
        const existingIds = new Set((existing ?? []).map((e: { id: string }) => e.id));
        const newRecords      = records.filter(r => !existingIds.has(r.id));
        const existingRecords = records.filter(r =>  existingIds.has(r.id));

        if (newRecords.length) {
          const withFuente = fuente ? newRecords.map(r => ({ ...r, fuente })) : newRecords;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await sb.from(table).insert(withFuente as any[]);
          if (error) console.error(`[sheets-write] Supabase insert ${table}:`, error.message);
        }

        for (const r of existingRecords) {
          const rm = r as Record<string, unknown>;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updateObj: Record<string, any> = {
            tipo: rm.tipo, carga: rm.carga, regimen: rm.regimen, transporte: rm.transporte,
            tipo_comuna: rm.tipo_comuna,
            peso_kg: rm.peso_kg, alto: rm.alto, largo: rm.largo, ancho: rm.ancho, peso_v: rm.peso_v,
            ventana: rm.ventana, estado: rm.estado, n_pallet_bulto: rm.n_pallet_bulto,
          };
          if (fuente) updateObj.fuente = fuente;
          const { error } = await sb.from(table).update(updateObj).eq('id', r.id);
          if (error) console.error(`[sheets-write] Supabase update ${table}:`, error.message);
        }
      }
    }

    return NextResponse.json({ ok: true, written: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sheets-write]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
