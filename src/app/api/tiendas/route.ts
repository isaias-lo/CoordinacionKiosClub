import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth, verifyAdmin } from '@/lib/apiAuth';
import { parseBody, CreateTiendaSchema } from '@/lib/schemas';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';
const SHEET_TIENDAS  = 'TIENDAS';

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

interface TiendaBody {
  codigo: string;
  nombre: string;
  direccion?: string;
  region?: string;
  sector_comuna?: string;
  corredor?: string;
  tipo?: string;
  ventana?: string;
  frecuencia?: string;
  prom_por_dia?: string;
  lat?: number | null;
  lon?: number | null;
  correos?: string;
  tel_encargado?: string;
  supervisor?: string;
  tel_supervisor?: string;
  transportista?: string;
  activo?: boolean;
}

function buildSheetRow(t: TiendaBody): string[] {
  return [
    t.codigo?.trim().toUpperCase() ?? '',
    t.nombre?.trim() ?? '',
    t.direccion      ?? '',
    t.region         ?? '',
    t.sector_comuna  ?? '',
    t.corredor       ?? '',
    t.tipo           ?? '',
    t.ventana        ?? '',
    t.frecuencia     ?? '',
    t.prom_por_dia   ?? '',
    t.lat != null    ? String(t.lat) : '',
    t.lon != null    ? String(t.lon) : '',
    t.correos        ?? '',
    t.tel_encargado  ?? '',
    t.supervisor     ?? '',
    t.tel_supervisor ?? '',
    t.transportista  ?? '',
    t.activo !== false ? 'TRUE' : 'FALSE',
  ];
}

/** Upsert one store row in the TIENDAS sheet. Updates in-place if found, appends if new. */
async function syncTiendaToSheets(tienda: TiendaBody): Promise<void> {
  const auth = await getAuth();
  const gs   = google.sheets({ version: 'v4', auth });

  const readRes = await gs.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TIENDAS}!A1:R1000`,
  });

  const rows  = readRes.data.values || [];
  const cod   = tienda.codigo.trim().toUpperCase();
  const newRow = buildSheetRow(tienda);

  // Find existing row (skip header — it won't match a store code)
  let existingIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i]?.[0] ?? '').trim().toUpperCase() === cod) {
      existingIdx = i + 1; // convert to 1-indexed sheet row
      break;
    }
  }

  if (existingIdx >= 0) {
    await gs.spreadsheets.values.update({
      spreadsheetId:   SPREADSHEET_ID,
      range:           `${SHEET_TIENDAS}!A${existingIdx}:R${existingIdx}`,
      valueInputOption: 'RAW',
      requestBody:     { values: [newRow] },
    });
  } else {
    await gs.spreadsheets.values.append({
      spreadsheetId:   SPREADSHEET_ID,
      range:           `${SHEET_TIENDAS}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody:     { values: [newRow] },
    });
  }
}

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const sb = supabaseServer();
    const { data, error } = await sb
      .from('tiendas')
      .select('codigo, nombre, direccion, region, sector_comuna, corredor, tipo, ventana, frecuencia, prom_por_dia, lat, lon, correos, tel_encargado, supervisor, tel_supervisor, transportista, activo, created_at, updated_at')
      .order('codigo');
    if (error) throw error;
    return NextResponse.json({ tiendas: data });
  } catch (err) {
    console.error('[GET /api/tiendas]', err);
    return NextResponse.json({ error: 'Error al obtener tiendas' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  try {
    const parsed = parseBody(CreateTiendaSchema, await request.json());
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as TiendaBody;

    const sb = supabaseServer();
    const { data, error } = await sb
      .from('tiendas')
      .upsert({
        codigo:         body.codigo.trim().toUpperCase(),
        nombre:         body.nombre.trim(),
        direccion:      body.direccion      ?? '',
        region:         body.region         ?? '',
        sector_comuna:  body.sector_comuna  ?? '',
        corredor:       body.corredor       ?? '',
        tipo:           body.tipo           ?? '',
        ventana:        body.ventana        ?? '',
        frecuencia:     body.frecuencia     ?? '',
        prom_por_dia:   body.prom_por_dia   ?? '',
        lat:            body.lat            ?? null,
        lon:            body.lon            ?? null,
        correos:        body.correos        ?? '',
        tel_encargado:  body.tel_encargado  ?? '',
        supervisor:     body.supervisor     ?? '',
        tel_supervisor: body.tel_supervisor ?? '',
        transportista:  body.transportista  ?? '',
        activo:         body.activo         ?? true,
      }, { onConflict: 'codigo' })
      .select()
      .single();

    if (error) throw error;

    // Fire-and-forget: sync to Google Sheets (doesn't block response)
    syncTiendaToSheets(body).catch(e => console.error('[POST /api/tiendas:sheets]', e));

    return NextResponse.json({ tienda: data });
  } catch (err) {
    console.error('[POST /api/tiendas]', err);
    return NextResponse.json({ error: 'Error al guardar tienda' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const codigo = searchParams.get('codigo');
    if (!codigo) return NextResponse.json({ error: 'codigo requerido' }, { status: 400 });

    const sb = supabaseServer();
    const { error } = await sb.from('tiendas').delete().eq('codigo', codigo);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/tiendas]', err);
    return NextResponse.json({ error: 'Error al eliminar tienda' }, { status: 500 });
  }
}
