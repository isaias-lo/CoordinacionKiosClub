import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { verifyAdmin } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { normalizeCod, COD_RE } from './normalizeCod';
import { looksLikeHeader, rowToTienda } from './parseRows';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

// Column mapping for TIENDAS sheet:
// A(0)=CÓDIGO  B(1)=NOMBRE  C(2)=DIRECCIÓN  D(3)=REGIÓN  E(4)=SECTOR/COMUNA
// F(5)=CORREDOR  G(6)=TIPO  H(7)=VENTANA  I(8)=FRECUENCIA  J(9)=PROM P/DÍA
// K(10)=LAT  L(11)=LON  M(12)=CORREOS  N(13)=TEL ENCARGADO
// O(14)=SUPERVISOR  P(15)=TEL SUPERVISOR  Q(16)=TRANSPORTISTA  R(17)=ACTIVO

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no configurado');
  const clean = raw.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(clean),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}


export async function POST(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'TIENDAS',
    });

    const values = response.data.values ?? [];
    const rows: Record<string, unknown>[] = [];
    const skipped: { row: number; raw: string; reason: string }[] = [];

    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (!row || !row[0]) continue;

      const raw = String(row[0]).trim();
      const cod = normalizeCod(raw);

      if (!COD_RE.test(cod)) {
        // Solo reportar filas que parecen ser tiendas reales (no títulos ni encabezados)
        if (!looksLikeHeader(raw)) {
          skipped.push({ row: i + 1, raw, reason: `Código "${cod}" no coincide con formato esperado` });
        }
        continue;
      }

      rows.push(rowToTienda(row));
    }

    if (!rows.length) {
      return NextResponse.json({ ok: false, message: 'No se encontraron tiendas en el Sheet', skipped });
    }

    const sb = supabaseServer();
    const { error } = await sb.from('tiendas').upsert(rows, { onConflict: 'codigo' });
    if (error) throw error;

    return NextResponse.json({ ok: true, synced: rows.length, skipped });
  } catch (err) {
    console.error('[POST /api/tiendas/sync]', err);
    return NextResponse.json({ error: 'Error al sincronizar tiendas' }, { status: 500 });
  }
}
