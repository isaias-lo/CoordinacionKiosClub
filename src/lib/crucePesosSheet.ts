import { google } from 'googleapis';
import {
  ENCABEZADO_CRUCE, HOJA_CRUCE, COL_LLAVE,
  llaveDeFila, indicesDeEncabezado, aFilaPosicional, normalizarColumna,
  formulaPctDif, letraDeColumna, primeraFilaDe,
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
  /** Columnas del sistema que la hoja no tenía y se agregaron al final en esta llamada. */
  columnasAgregadas: string[];
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
  if (!valores.length) return { agregadas: 0, actualizadas: 0, hojaCreada: false, columnasAgregadas: [] };

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

  // La MISMA hoja, pero con las fórmulas en vez de su resultado. Es de acá que sale `filaPrevia`,
  // o sea lo que se conserva de una fila al actualizarla.
  //
  // Con la lectura formateada, una columna que alguien agregó a mano con una fórmula adentro se
  // guardaba de vuelta como TEXTO — el resultado de ese momento, congelado — y la fórmula
  // desaparecía en el próximo registro sin que nadie lo notara. La lectura formateada sigue
  // haciendo falta para la LLAVE: ahí la fecha tiene que decir «28/09/2026» y no su número de serie.
  const leidoFormulas = await gs.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: HOJA_CRUCE,
    valueRenderOption: 'FORMULA',
  });
  const filasPrevias = leidoFormulas.data.values ?? filasHoja;

  // Las columnas del sistema que la hoja todavía no tiene SE AGREGAN AL FINAL.
  //
  // Antes esto lanzaba `ColumnasRenombradas` sin distinguir dos casos que no son lo mismo:
  //
  //   · alguien renombró una columna    → la nueva queda vacía y la vieja, huérfana pero INTACTA
  //   · el sistema estrenó una columna  → simplemente no existe todavía
  //
  // Negarse en el segundo caso obligaba a que una persona creara el encabezado a mano antes de
  // que la hoja volviera a escribirse — y mientras tanto no se escribía NADA. Agregarla no pierde
  // datos en ninguno de los dos casos, y el resultado dice cuáles se agregaron para que un
  // renombre accidental se note igual.
  //
  // Va al final a propósito: insertar en el medio correría las columnas que alguien acomodó.
  const faltantes = ENCABEZADO_CRUCE.filter(c => idx[normalizarColumna(c)] === undefined);
  if (faltantes.length) {
    const desde = encabezado.length;
    encabezado.push(...faltantes);
    faltantes.forEach((c, i) => { idx[normalizarColumna(c)] = desde + i; });
    await gs.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${HOJA_CRUCE}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [encabezado] },
    });
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
    const previa = nFila ? (filasPrevias[nFila - 1] ?? []).map(x => String(x ?? '')) : [];
    // La fórmula de `% DIF` necesita el número de fila. Al actualizar se sabe; al agregar todavía
    // no — lo dice el `append` cuando responde, y recién ahí se escriben (ver más abajo).
    const fila   = aFilaPosicional(v, encabezado, previa, nFila);
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
    const res = await gs.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${HOJA_CRUCE}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: nuevas },
    });
    // Las filas nuevas llevan el número en `% DIF`, porque al armarlas no se sabía en qué fila
    // iban a caer. Ahora sí: lo dice el rango que devuelve el `append`. No se calcula sumando al
    // largo de la hoja — la planilla tenía filas al final con la fórmula arrastrada y sin datos, y
    // ahí la cuenta habría dado un número equivocado y la fórmula apuntaría a otra fila.
    const desdeFila = primeraFilaDe(res.data.updates?.updatedRange);
    const iPct = idx[normalizarColumna('% DIF')];
    if (desdeFila && iPct !== undefined) {
      const letra = letraDeColumna(iPct);
      const celdas = nuevas
        .map((fila, k) => ({ fila, n: desdeFila + k }))
        .filter(({ fila }) => fila[iPct] !== '')
        .map(({ n }) => ({
          range: `${HOJA_CRUCE}!${letra}${n}`,
          values: [[formulaPctDif(encabezado, n) ?? '']],
        }))
        .filter(c => c.values[0][0] !== '');
      if (celdas.length) {
        await gs.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: { valueInputOption: 'USER_ENTERED', data: celdas },
        });
      }
    }
  }

  return { agregadas: nuevas.length, actualizadas: cambios.length, hojaCreada, columnasAgregadas: faltantes };
}
