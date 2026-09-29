import { google } from 'googleapis';
import {
  ENCABEZADO_CRUCE, HOJA_CRUCE, COL_LLAVE,
  llaveDeFila, indicesDeEncabezado, aFilaPosicional, normalizarColumna,
} from '../features/despacho/shared/hojaCrucePesos';

// Escribir la hoja CRUCE PESOS. Vive acá y no dentro de la ruta para que la carga inicial de días
// pasados use EXACTAMENTE el mismo código que el registro del día — si fueran dos copias, una
// podría escribir distinto que la otra y nadie lo notaría hasta comparar dos filas a mano.

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '';

function auth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '';
  const credentials = JSON.parse(raw) as { client_email: string; private_key: string };
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export class ColumnasRenombradas extends Error {
  constructor(public columnas: string[]) {
    super(`La hoja no tiene estas columnas (¿se renombraron?): ${columnas.join(', ')}`);
    this.name = 'ColumnasRenombradas';
  }
}

/** Crea la pestaña con su encabezado si no existe. */
async function asegurarHoja(gs: ReturnType<typeof google.sheets>): Promise<boolean> {
  const meta = await gs.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets(properties(title))',
  });
  if (meta.data.sheets?.some(s => s.properties?.title === HOJA_CRUCE)) return false;

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
  return true;
}

export interface ResultadoEscritura {
  agregadas: number;
  actualizadas: number;
  /** La pestaña se creó en esta llamada. */
  hojaCreada: boolean;
}

/**
 * Escribe (o actualiza) las filas del cruce.
 *
 * Cada fila se busca por (FECHA, CÓDIGO): si ya está, se actualiza EN SU LUGAR; si no, se agrega.
 * Eso es lo que hace que registrar una tienda sola y después el día completo deje una sola fila.
 *
 * Se escribe POR NOMBRE de columna: se lee el encabezado real, así que las columnas se pueden
 * reordenar, y las celdas que el sistema no conoce se conservan tal cual estaban.
 */
export async function escribirCruce(
  valores: Record<string, string | number>[],
): Promise<ResultadoEscritura> {
  if (!SPREADSHEET_ID) throw new Error('Falta GOOGLE_SPREADSHEET_ID');
  if (!valores.length) return { agregadas: 0, actualizadas: 0, hojaCreada: false };

  const gs = google.sheets({ version: 'v4', auth: auth() });
  const hojaCreada = await asegurarHoja(gs);

  // La hoja ENTERA: el encabezado real para ubicar cada valor, y las filas previas para no pisar
  // una columna agregada a mano.
  const leido = await gs.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: HOJA_CRUCE,
  });
  const filasHoja = leido.data.values ?? [];
  const encabezado = (filasHoja[0] ?? []).map(String);
  const idx = indicesDeEncabezado(encabezado);

  // Si alguien RENOMBRÓ una columna del sistema, esos datos se perderían en silencio. Es lo único
  // que este diseño no puede absorber solo, así que se niega y dice cuál.
  const perdidas = ENCABEZADO_CRUCE.filter(c => idx[normalizarColumna(c)] === undefined);
  if (perdidas.length) throw new ColumnasRenombradas(perdidas);

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

  return { agregadas: nuevas.length, actualizadas: cambios.length, hojaCreada };
}
