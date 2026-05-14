import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabaseServer } from '@/lib/supabaseServer';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

// Column mapping for TIENDAS sheet:
// A(0)=CÓDIGO  B(1)=NOMBRE  C(2)=DIRECCIÓN  D(3)=REGIÓN  E(4)=SECTOR/COMUNA
// F(5)=CORREDOR  G(6)=TIPO  H(7)=VENTANA  I(8)=FRECUENCIA  J(9)=PROM P/DÍA
// K(10)=LAT  L(11)=LON  M(12)=CORREOS  N(13)=TEL ENCARGADO
// O(14)=SUPERVISOR  P(15)=TEL SUPERVISOR  Q(16)=TRANSPORTISTA  R(17)=ACTIVO

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no configurado');
  const clean = raw.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(clean),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

function parseFloat_(s: string): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? null : n;
}

export async function POST() {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'TIENDAS',
    });

    const values = response.data.values ?? [];
    // Find first data row (skip headers — detect by looking for a valid código pattern)
    const COD_RE = /^[0-9]{0,2}[A-Z]{2,4}[0-9]?$/;

    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (!row || !row[0]) continue;
      const cod = String(row[0]).trim().toUpperCase();
      if (!COD_RE.test(cod)) continue;

      const lat = parseFloat_(row[10] ?? '');
      const lon = parseFloat_(row[11] ?? '');

      rows.push({
        codigo:         cod,
        nombre:         row[1]?.trim() ?? '',
        direccion:      row[2]?.trim() ?? '',
        region:         row[3]?.trim() ?? '',
        sector_comuna:  row[4]?.trim() ?? '',
        corredor:       row[5]?.trim() ?? '',
        tipo:           row[6]?.trim() ?? '',
        ventana:        row[7]?.trim() ?? '',
        frecuencia:     row[8]?.trim() ?? '',
        prom_por_dia:   row[9]?.trim() ?? '',
        lat:            lat,
        lon:            lon,
        correos:        row[12]?.trim() ?? '',
        tel_encargado:  row[13]?.trim() ?? '',
        supervisor:     row[14]?.trim() ?? '',
        tel_supervisor: row[15]?.trim() ?? '',
        transportista:  row[16]?.trim() ?? '',
        activo:         (row[17]?.trim().toUpperCase() ?? 'SI') !== 'NO',
      });
    }

    if (!rows.length) {
      return NextResponse.json({ ok: false, message: 'No se encontraron tiendas en el Sheet' });
    }

    const sb = supabaseServer();
    const { error } = await sb.from('tiendas').upsert(rows, { onConflict: 'codigo' });
    if (error) throw error;

    return NextResponse.json({ ok: true, synced: rows.length });
  } catch (err) {
    console.error('[POST /api/tiendas/sync]', err);
    return NextResponse.json({ error: 'Error al sincronizar tiendas' }, { status: 500 });
  }
}
