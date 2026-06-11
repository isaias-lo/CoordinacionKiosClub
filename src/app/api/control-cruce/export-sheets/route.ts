import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabaseServer } from '@/lib/supabaseServer';

const SPREADSHEET_ID = process.env.GOOGLE_CONTROL_CRUCE_SHEET_ID ?? '';
const SHEET_GID      = 1832124874;

const HEADERS = [
  'TIENDA', 'FECHA ARMADO', 'RESPONSABLE ARMADO', 'MOV ODOO',
  'FECHA DECLARACIÓN', 'AUDITADO', 'AUDITOR', 'DETALLE',
  'SKU', 'CORRECTA DEC.', 'MOV AJUSTE', 'FECHA EXPORTACIÓN',
];

interface ExportRow {
  storeCod:          string;
  pickingName:       string;
  fechaArmado:       string;
  fechaDeclaracion:  string | null;
  responsableArmado: string;
  auditado:          string;
  auditorName:       string;
  detalle:           string;
  correcta_declaracion: string;
  movimiento_ajuste: string;
  movAjuste:         string;
}

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no configurado');
  const clean = raw.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const creds = JSON.parse(clean);
  // Newlines en la private_key pueden quedar como "\\n" literales en .env.local
  if (typeof creds.private_key === 'string') {
    creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  }
  return creds;
}

async function getSheetName(
  sheets: ReturnType<typeof google.sheets>,
): Promise<string> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = meta.data.sheets?.find(s => s.properties?.sheetId === SHEET_GID);
  if (!sheet?.properties?.title) {
    throw new Error(`Hoja con gid ${SHEET_GID} no encontrada en el spreadsheet`);
  }
  return sheet.properties.title;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export async function POST(req: Request) {
  if (!SPREADSHEET_ID) {
    return NextResponse.json(
      { error: 'GOOGLE_CONTROL_CRUCE_SHEET_ID no configurado en .env.local' },
      { status: 500 },
    );
  }

  let rows: ExportRow[];
  let fecha: string;
  try {
    const body = await req.json() as { rows?: ExportRow[]; fecha?: string };
    rows = body.rows ?? [];
    fecha = body.fecha ?? new Date().toLocaleDateString('es-CL');
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  try {
    const auth   = new google.auth.GoogleAuth({ credentials: getCredentials(), scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const sheets = google.sheets({ version: 'v4', auth });
    const sheetName = await getSheetName(sheets);

    // Headers (solo si la hoja está vacía)
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1:A1`,
    });
    if (!existing.data.values?.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [HEADERS] },
      });
    }

    // Fetch SKUs for all pickings (keyed by picking_name + detalle)
    const { data: skuRows } = await supabaseServer()
      .from('control_cruce_skus')
      .select('picking_name, detalle, sku');

    const skusByKey = new Map<string, string[]>();
    for (const s of (skuRows ?? [])) {
      const key = `${s.picking_name}|${s.detalle ?? ''}`;
      const arr = skusByKey.get(key) ?? [];
      arr.push(s.sku);
      skusByKey.set(key, arr);
    }

    // Expand: one row per SKU (or one row with empty SKU if none)
    const dataRows: string[][] = [];
    for (const r of rows) {
      const key = `${r.pickingName}|${r.detalle ?? ''}`;
      const skus = skusByKey.get(key) ?? [''];
      for (const sku of skus) {
        dataRows.push([
          r.storeCod,
          fmtDate(r.fechaArmado),
          r.responsableArmado || '',
          r.pickingName,
          fmtDate(r.fechaDeclaracion),
          r.auditado,
          r.auditorName || '',
          r.detalle || '',
          sku,
          r.correcta_declaracion || 'PENDIENTE',
          r.movimiento_ajuste || r.movAjuste || '',
          fecha,
        ]);
      }
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: dataRows },
    });

    return NextResponse.json({ ok: true, rowsWritten: dataRows.length, sheet: sheetName, mode: 'append' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
