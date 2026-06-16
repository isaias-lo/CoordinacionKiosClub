import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';

const SPREADSHEET_ID = process.env.GOOGLE_CONTROL_CRUCE_SHEET_ID ?? '';
const SHEET_GID      = 1832124874;

// Headers para el tab fijo (export manual, sin ESTADO)
const HEADERS = [
  'TIENDA', 'FECHA ARMADO', 'RESPONSABLE ARMADO', 'MOV ODOO',
  'FECHA DECLARACIÓN', 'AUDITADO', 'AUDITOR', 'DETALLE',
  'SKU', 'CORRECTA DEC.', 'MOV AJUSTE', 'FECHA EXPORTACIÓN',
];

// Headers para tabs por fecha (auto-export, incluye ESTADO)
const HEADERS_AUTO = [
  'TIENDA', 'FECHA ARMADO', 'RESPONSABLE ARMADO', 'MOV ODOO',
  'FECHA DECLARACIÓN', 'AUDITADO', 'AUDITOR', 'DETALLE',
  'SKU', 'CORRECTA DEC.', 'MOV AJUSTE', 'ESTADO', 'FECHA EXPORTACIÓN',
];

interface ExportRow {
  storeCod:             string;
  pickingName:          string;
  fechaArmado:          string;
  fechaDeclaracion:     string | null;
  responsableArmado:    string;
  auditado:             string;
  auditorName:          string;
  detalle:              string;
  correcta_declaracion: string;
  movimiento_ajuste:    string;
  movAjuste:            string;
  estado?:              string;
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

export async function POST(req: NextRequest) {
  // Acepta usuarios autenticados (UI) o el cron interno (auto-export reenvía
  // su propio Bearer CRON_SECRET ya validado en ese handler).
  const cronSecret = process.env.CRON_SECRET ?? '';
  const authHeader = req.headers.get('authorization') ?? '';
  const isInternalCron = cronSecret !== '' && authHeader === `Bearer ${cronSecret}`;
  if (!isInternalCron && !(await verifyAuth(req))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (!SPREADSHEET_ID) {
    return NextResponse.json(
      { error: 'GOOGLE_CONTROL_CRUCE_SHEET_ID no configurado en .env.local' },
      { status: 500 },
    );
  }

  let rows: ExportRow[];
  let fecha: string;
  let tabName: string | undefined;
  try {
    const body = await req.json() as { rows?: ExportRow[]; fecha?: string; tabName?: string };
    rows    = body.rows ?? [];
    fecha   = body.fecha ?? new Date().toLocaleDateString('es-CL');
    tabName = body.tabName; // si viene → pestaña por fecha (auto-export)
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  try {
    const auth   = new google.auth.GoogleAuth({ credentials: getCredentials(), scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const sheets = google.sheets({ version: 'v4', auth });

    // SKUs compartidos (ambas rutas los necesitan)
    const { data: skuRows } = await supabaseServer()
      .from('control_cruce_skus')
      .select('picking_name, detalle, sku');

    const skusByKey = new Map<string, string[]>();
    for (const s of (skuRows ?? [])) {
      const key = `${s.picking_name}|${s.detalle ?? ''}`;
      (skusByKey.get(key) ?? skusByKey.set(key, []).get(key)!).push(s.sku);
    }

    // ── Construir filas de datos ──────────────────────────────────────────────
    const isAuto   = !!tabName;
    const dataRows: string[][] = [];
    for (const r of rows) {
      const key  = `${r.pickingName}|${r.detalle ?? ''}`;
      const skus = skusByKey.get(key) ?? [''];
      for (const sku of skus) {
        const base = [
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
        ];
        if (isAuto) base.push(r.estado ?? '');
        base.push(fecha);
        dataRows.push(base);
      }
    }

    // ── Rama A: pestaña por fecha (auto-export) — crear/limpiar/escribir ──────
    if (isAuto) {
      const meta   = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
      const exists = meta.data.sheets?.find(s => s.properties?.title === tabName);

      if (exists) {
        await sheets.spreadsheets.values.clear({
          spreadsheetId: SPREADSHEET_ID,
          range: `${tabName}!A:Z`,
        });
      } else {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
        });
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${tabName}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [HEADERS_AUTO, ...dataRows] },
      });

      return NextResponse.json({ ok: true, rowsWritten: dataRows.length, sheet: tabName, mode: 'tab' });
    }

    // ── Rama B: tab fijo por GID (export manual — append) ────────────────────
    const sheetName = await getSheetName(sheets);

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
