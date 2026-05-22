import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import type { sheets_v4 } from 'googleapis';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';
const SHEET_NAME = 'CALENDARIO';
const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
const DNOM = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
const TOTAL_COLS = 8; // A–H

type CalRecord = Record<string, { rm: string[]; costa: string[]; fal: string[] }>;
type StoreType = 'rm' | 'mall' | 'costa' | 'norte' | 'sur';
type StoreDayEntry = { code: string; type: StoreType };

const ZONA_NORTE_FAL = new Set(['41ANA', '42ANP', '39PSB', '51SER']);
const RM_MALLS       = new Set(['16PQA', '20CTC', '29CFL', '52MUT', '19SUB', '45EST', '49PTA']);

const TITLE          = '⚡ CALENDARIO DE DESPACHO — Flota Luis (sale día siguiente del armado) | Falabella (retira mismo día 12:00-14:00) | Sábado → despacha Lunes';
const RM_LABEL       = 'RM';
const FAL_LABEL      = '🏠 FALABELLA — Retira mismo día del armado (aprox 12:00-14:00)';
const ARMADO_LABEL   = '✅ ARMADO SECO (vista CD) — Guía se arma cada día | Verde = para Flota Luis (sale día siguiente) | Rosa = para Falabella (retira mismo día)';

// Fixed section sizes — row positions must be stable regardless of daily store count:
//   Row 1       = Title             (index 0)
//   Row 2       = Column headers    (index 1)
//   Row 3       = RM section hdr   (index 2)
//   Rows 4–26   = RM data          (23 fixed rows)
//   Row 27      = FAL section hdr  (index 26)
//   Rows 28–36  = FAL data         (9 fixed rows)
//   Row 37      = ARMADO SECO hdr  (index 36)
//   Row 38      = ARMADO totals    (index 37)
//   Rows 39+    = ARMADO data      (dynamic)
const RM_FIXED_ROWS  = 23;
const FAL_FIXED_ROWS = 9;

function hex(h: string): sheets_v4.Schema$Color {
  return {
    red:   parseInt(h.slice(1, 3), 16) / 255,
    green: parseInt(h.slice(3, 5), 16) / 255,
    blue:  parseInt(h.slice(5, 7), 16) / 255,
  };
}

const HDR_BG        = hex('#111A3E'); // dark navy   — title + column headers
const RM_HDR_BG     = hex('#1F2937'); // dark gray   — RM section label
const FAL_HDR_BG    = hex('#9D174D'); // dark rose   — FAL section label
const ARMADO_HDR_BG = hex('#14532D'); // dark green  — ARMADO SECO label
const WHITE         = hex('#FFFFFF');
const WHT_TXT       = hex('#FFFFFF');
const DRK_TXT       = hex('#1C1C1E');

// Calendar section cell colors per store type
const BG: Record<StoreType, sheets_v4.Schema$Color> = {
  rm:    hex('#D1FAE5'), // light green  — Flota Luis regular RM
  mall:  hex('#FECDD3'), // light rose   — Malls RM
  costa: hex('#99F6E4'), // teal         — Costa Valparaíso
  norte: hex('#BAE6FD'), // light blue   — Zona Norte (FAL)
  sur:   hex('#FEF08A'), // light yellow — Zona Sur (FAL)
};

// ARMADO SECO cell colors (simplified: Flota Luis = green, Falabella = pink)
const ARMADO_GREEN = hex('#D1FAE5');
const ARMADO_PINK  = hex('#FECDD3');

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

function rng(sid: number, r0: number, r1: number, c0: number, c1: number) {
  return { sheetId: sid, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 };
}

function cellFmt(
  sid: number, r0: number, r1: number, c0: number, c1: number,
  bg: sheets_v4.Schema$Color,
  opts: { bold?: boolean; fs?: number; color?: sheets_v4.Schema$Color; ha?: string; va?: string }
): sheets_v4.Schema$Request {
  return {
    repeatCell: {
      range: rng(sid, r0, r1, c0, c1),
      cell: {
        userEnteredFormat: {
          backgroundColor: bg,
          textFormat: {
            bold: opts.bold ?? false,
            foregroundColor: opts.color ?? DRK_TXT,
            fontSize: opts.fs ?? 10,
          },
          horizontalAlignment: opts.ha ?? 'CENTER',
          verticalAlignment: opts.va ?? 'MIDDLE',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const { calendario } = await request.json() as { calendario: CalRecord };
    if (!calendario) return NextResponse.json({ error: 'calendario requerido' }, { status: 400 });

    const auth = await getAuth();
    const gs = google.sheets({ version: 'v4', auth });

    const metaRes = await gs.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets.properties' });
    const sheetMeta = metaRes.data.sheets?.find(s => s.properties?.title === SHEET_NAME);
    const sid = sheetMeta?.properties?.sheetId ?? 0;

    // ── 1. Build per-day store lists ─────────────────────────────────────────
    const rmDays: StoreDayEntry[][] = DIAS.map(dia => [
      ...(calendario[dia]?.rm    || []).map(c => ({ code: c, type: (RM_MALLS.has(c) ? 'mall' : 'rm') as StoreType })),
      ...(calendario[dia]?.costa || []).map(c => ({ code: c, type: 'costa' as StoreType })),
    ]);

    const falDays: StoreDayEntry[][] = DIAS.map(dia =>
      (calendario[dia]?.fal || []).map(c => ({ code: c, type: (ZONA_NORTE_FAL.has(c) ? 'norte' : 'sur') as StoreType }))
    );

    // ARMADO SECO: all stores combined (rm + costa then fal), per day
    type ArmadoEntry = { code: string; isFal: boolean };
    const armadoDays: ArmadoEntry[][] = DIAS.map(dia => [
      ...(calendario[dia]?.rm    || []).map(c => ({ code: c, isFal: false })),
      ...(calendario[dia]?.costa || []).map(c => ({ code: c, isFal: false })),
      ...(calendario[dia]?.fal   || []).map(c => ({ code: c, isFal: true  })),
    ]);
    const maxArmadoRows = Math.max(0, ...armadoDays.map(d => d.length));

    // ── 2. Build value grid and row metadata ──────────────────────────────────
    type RowMeta =
      | { type: 'title' }
      | { type: 'header' }
      | { type: 'rm-hdr' }
      | { type: 'rm-data';      slot: number }
      | { type: 'fal-hdr' }
      | { type: 'fal-data';     slot: number }
      | { type: 'armado-hdr' }
      | { type: 'armado-totals' }
      | { type: 'armado-data';  slot: number };

    const values: string[][] = [];
    const meta:   RowMeta[]  = [];

    // ── Calendar section (rows 1–36) ────────────────────────────────────────
    values.push([TITLE, '', '', '', '', '', '', '']);
    meta.push({ type: 'title' });

    values.push(['GRUPO', 'TIPO', ...DNOM]);
    meta.push({ type: 'header' });

    values.push([RM_LABEL, '', '', '', '', '', '', '']);
    meta.push({ type: 'rm-hdr' });

    for (let slot = 0; slot < RM_FIXED_ROWS; slot++) {
      const row: string[] = ['', ''];
      for (let d = 0; d < 6; d++) row.push(rmDays[d][slot]?.code ?? '');
      values.push(row);
      meta.push({ type: 'rm-data', slot });
    }

    values.push([FAL_LABEL, '', '', '', '', '', '', '']);
    meta.push({ type: 'fal-hdr' });

    for (let slot = 0; slot < FAL_FIXED_ROWS; slot++) {
      const row: string[] = ['', ''];
      for (let d = 0; d < 6; d++) row.push(falDays[d][slot]?.code ?? '');
      values.push(row);
      meta.push({ type: 'fal-data', slot });
    }

    // ── ARMADO SECO section (row 37+) ───────────────────────────────────────
    values.push([ARMADO_LABEL, '', '', '', '', '', '', '']);
    meta.push({ type: 'armado-hdr' });

    values.push(['TIPO', 'DESTINO', ...armadoDays.map(d => `Total armado: ${d.length}`)]);
    meta.push({ type: 'armado-totals' });

    for (let slot = 0; slot < maxArmadoRows; slot++) {
      const row: string[] = ['', ''];
      for (let d = 0; d < 6; d++) row.push(armadoDays[d][slot]?.code ?? '');
      values.push(row);
      meta.push({ type: 'armado-data', slot });
    }

    const totalRows = values.length;

    // ── 3. Clear + write ─────────────────────────────────────────────────────
    await gs.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:H${totalRows + 3}`,
    });

    await gs.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: [{ range: `${SHEET_NAME}!A1:H${totalRows}`, values }],
      },
    });

    // ── 4. Formatting ─────────────────────────────────────────────────────────
    const reqs: sheets_v4.Schema$Request[] = [];

    const mergeRow = (i: number) => {
      reqs.push({ unMergeCells: { range: rng(sid, i, i + 1, 0, TOTAL_COLS) } });
      reqs.push({ mergeCells:   { range: rng(sid, i, i + 1, 0, TOTAL_COLS), mergeType: 'MERGE_ALL' } });
    };

    for (let i = 0; i < meta.length; i++) {
      const m = meta[i];

      if (m.type === 'title') {
        mergeRow(i);
        reqs.push(cellFmt(sid, i, i + 1, 0, TOTAL_COLS, HDR_BG, { bold: true, fs: 11, color: WHT_TXT }));
      }
      else if (m.type === 'header') {
        reqs.push(cellFmt(sid, i, i + 1, 0, TOTAL_COLS, HDR_BG, { bold: true, fs: 11, color: WHT_TXT }));
      }
      else if (m.type === 'rm-hdr') {
        mergeRow(i);
        reqs.push(cellFmt(sid, i, i + 1, 0, TOTAL_COLS, RM_HDR_BG, { bold: true, fs: 11, color: WHT_TXT, ha: 'LEFT' }));
      }
      else if (m.type === 'fal-hdr') {
        mergeRow(i);
        reqs.push(cellFmt(sid, i, i + 1, 0, TOTAL_COLS, FAL_HDR_BG, { bold: true, fs: 10, color: WHT_TXT, ha: 'LEFT' }));
      }
      else if (m.type === 'armado-hdr') {
        mergeRow(i);
        reqs.push(cellFmt(sid, i, i + 1, 0, TOTAL_COLS, ARMADO_HDR_BG, { bold: true, fs: 10, color: WHT_TXT, ha: 'LEFT' }));
      }
      else if (m.type === 'armado-totals') {
        // A–B: labels TIPO/DESTINO; C–H: "Total armado: N" bold
        reqs.push(cellFmt(sid, i, i + 1, 0, 2, HDR_BG, { bold: true, fs: 10, color: WHT_TXT }));
        reqs.push(cellFmt(sid, i, i + 1, 2, TOTAL_COLS, HDR_BG, { bold: true, fs: 10, color: WHT_TXT }));
      }
      else if (m.type === 'rm-data') {
        reqs.push(cellFmt(sid, i, i + 1, 0, 2, WHITE, { bold: false, fs: 10 }));
        for (let d = 0; d < 6; d++) {
          const entry = rmDays[d][m.slot];
          reqs.push(cellFmt(sid, i, i + 1, 2 + d, 3 + d,
            entry ? BG[entry.type] : WHITE,
            { bold: !!entry, fs: 10 }
          ));
        }
      }
      else if (m.type === 'fal-data') {
        reqs.push(cellFmt(sid, i, i + 1, 0, 2, WHITE, { bold: false, fs: 10 }));
        for (let d = 0; d < 6; d++) {
          const entry = falDays[d][m.slot];
          reqs.push(cellFmt(sid, i, i + 1, 2 + d, 3 + d,
            entry ? BG[entry.type] : WHITE,
            { bold: !!entry, fs: 10 }
          ));
        }
      }
      else if (m.type === 'armado-data') {
        reqs.push(cellFmt(sid, i, i + 1, 0, 2, WHITE, { bold: false, fs: 10 }));
        for (let d = 0; d < 6; d++) {
          const entry = armadoDays[d][m.slot];
          reqs.push(cellFmt(sid, i, i + 1, 2 + d, 3 + d,
            entry ? (entry.isFal ? ARMADO_PINK : ARMADO_GREEN) : WHITE,
            { bold: !!entry, fs: 10 }
          ));
        }
      }
    }

    // Column widths: A=80, B=100 (DESTINO label fits), C–H=90
    reqs.push({ updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 80  }, fields: 'pixelSize' } });
    reqs.push({ updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } });
    reqs.push({ updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: 2, endIndex: TOTAL_COLS }, properties: { pixelSize: 90 }, fields: 'pixelSize' } });

    // Row heights
    for (let i = 0; i < meta.length; i++) {
      const t = meta[i].type;
      const px = t === 'title' ? 40
               : t === 'header' ? 26
               : (t === 'rm-hdr' || t === 'fal-hdr' || t === 'armado-hdr') ? 24
               : t === 'armado-totals' ? 26
               : 22;
      reqs.push({ updateDimensionProperties: { range: { sheetId: sid, dimension: 'ROWS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } });
    }

    // Freeze title + header rows
    reqs.push({ updateSheetProperties: { properties: { sheetId: sid, gridProperties: { frozenRowCount: 2 } }, fields: 'gridProperties.frozenRowCount' } });

    await gs.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: reqs } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[calendario-write]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
