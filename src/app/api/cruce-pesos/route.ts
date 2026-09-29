import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { verifyAdmin } from '@/lib/apiAuth';
import {
  ENCABEZADO_CRUCE, HOJA_CRUCE, COL_LLAVE,
  llaveDeFila, indicesDeEncabezado, aFilaPosicional, normalizarColumna,
} from '@/features/despacho/shared/hojaCrucePesos';

// Escribe la hoja CRUCE PESOS. Una fila por tienda y por día.
//
// TRES COSAS QUE ESTA RUTA GARANTIZA:
//
// 1. LA PESTAÑA SE CREA SOLA, con el encabezado que define `hojaCrucePesos`. El encabezado y lo
//    que se escribe salen del MISMO arreglo, así que no pueden desalinearse. Esto viene de un
//    error real: la referencia de Odoo se guardaba desde Picking y nunca se vio en ninguna parte,
//    porque quien la guardaba y quien la mostraba se construyeron por separado.
//
// 2. NO DUPLICA. Cada fila se busca por (FECHA, CÓDIGO): si ya está, se ACTUALIZA en su lugar; si
//    no, se agrega al final. Por eso registrar una tienda sola y después el día completo deja UNA
//    fila por tienda, no dos.
//
// 3. SE ESCRIBE POR NOMBRE DE COLUMNA. Se lee el encabezado REAL antes de escribir, así que las
//    columnas se pueden reordenar sin romper nada — al revés que el resto de las hojas del sistema,
//    que son posicionales. Y una columna agregada a mano no se pisa: al actualizar una fila se
//    conservan las celdas que el sistema no conoce.
//
// Solo admin: el cruce compara el trabajo del andén contra Odoo y no es información de operación.

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '';

function auth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '';
  const credentials = JSON.parse(raw) as { client_email: string; private_key: string };
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

/** Crea la pestaña con su encabezado si no existe. */
async function asegurarHoja(gs: ReturnType<typeof google.sheets>): Promise<void> {
  const meta = await gs.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets(properties(title))',
  });
  if (meta.data.sheets?.some(s => s.properties?.title === HOJA_CRUCE)) return;

  await gs.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        addSheet: {
          properties: {
            title: HOJA_CRUCE,
            gridProperties: { rowCount: 2000, columnCount: ENCABEZADO_CRUCE.length, frozenRowCount: 1 },
          },
        },
      }],
    },
  });
  await gs.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${HOJA_CRUCE}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [[...ENCABEZADO_CRUCE]] },
  });
}

export async function POST(request: NextRequest) {
  if (!await verifyAdmin(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  if (!SPREADSHEET_ID) {
    return NextResponse.json({ error: 'Falta GOOGLE_SPREADSHEET_ID' }, { status: 500 });
  }

  // Llegan VALORES POR NOMBRE de columna, no filas posicionales: quién escribe decide la posición
  // recién después de leer el encabezado real.
  let valores: Record<string, string | number>[];
  try {
    const body = await request.json() as { valores?: Record<string, string | number>[] };
    valores = Array.isArray(body.valores) ? body.valores : [];
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (!valores.length) return NextResponse.json({ ok: true, agregadas: 0, actualizadas: 0 });

  const sinLlave = valores.filter(v => !v?.[COL_LLAVE[0]] || !v?.[COL_LLAVE[1]]);
  if (sinLlave.length) {
    return NextResponse.json(
      { error: `${sinLlave.length} fila(s) sin ${COL_LLAVE.join(' o ')}` },
      { status: 400 },
    );
  }

  try {
    const gs = google.sheets({ version: 'v4', auth: auth() });
    await asegurarHoja(gs);

    // La hoja ENTERA: el encabezado real para ubicar cada valor, y las filas previas para no pisar
    // una columna agregada a mano.
    const leido = await gs.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: HOJA_CRUCE,
    });
    const filasHoja = leido.data.values ?? [];
    const encabezado = (filasHoja[0] ?? []).map(String);
    const idx = indicesDeEncabezado(encabezado);

    // Si alguien RENOMBRÓ una columna del sistema, esos datos se perderían en silencio. Mejor
    // negarse y decir cuál: es lo único que este diseño no puede absorber solo.
    const perdidas = ENCABEZADO_CRUCE.filter(c => idx[normalizarColumna(c)] === undefined);
    if (perdidas.length) {
      return NextResponse.json(
        { error: `La hoja no tiene estas columnas (¿se renombraron?): ${perdidas.join(', ')}` },
        { status: 409 },
      );
    }

    const iFecha = idx[normalizarColumna(COL_LLAVE[0])];
    const iCod   = idx[normalizarColumna(COL_LLAVE[1])];

    const existentes = new Map<string, number>();
    for (let i = 1; i < filasHoja.length; i++) {          // i=0 es el encabezado
      const r = filasHoja[i];
      if (!r?.[iFecha] || !r?.[iCod]) continue;
      existentes.set(llaveDeFila(String(r[iFecha]), String(r[iCod])), i + 1);
    }

    const nuevas: (string | number)[][] = [];
    const cambios: { range: string; values: (string | number)[][] }[] = [];
    for (const v of valores) {
      const llave  = llaveDeFila(String(v[COL_LLAVE[0]]), String(v[COL_LLAVE[1]]));
      const nFila  = existentes.get(llave);
      const previa = nFila ? (filasHoja[nFila - 1] ?? []).map(x => String(x ?? '')) : [];
      const fila   = aFilaPosicional(v, encabezado, previa);
      if (nFila) cambios.push({ range: `${HOJA_CRUCE}!A${nFila}`, values: [fila] });
      else nuevas.push(fila);
    }

    if (cambios.length) {
      await gs.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: cambios },
      });
    }
    if (nuevas.length) {
      await gs.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${HOJA_CRUCE}!A1`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: nuevas },
      });
    }

    return NextResponse.json({ ok: true, agregadas: nuevas.length, actualizadas: cambios.length });
  } catch (err) {
    console.error('[cruce-pesos]', err);
    return NextResponse.json({ error: 'No se pudo escribir la hoja' }, { status: 500 });
  }
}
