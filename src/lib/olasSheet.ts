// Leer y escribir la hoja PICKING de «Abastecimiento por Olas».
//
// Es una planilla DISTINTA de la del sistema: `GOOGLE_SPREADSHEET_ID` apunta a «Base de Datos
// Despacho/Recepcion», y esta es otra, de otro equipo. Por eso tiene su propio id.
//
// ── LA CUENTA DE SERVICIO NECESITA PERMISO DE EDITOR ──────────────────────────────────────────
//
// Medido el 06/11/2026 con la API de Drive: sobre esta planilla la cuenta tiene `canEdit=false`
// —solo lectura—, mientras que sobre la del sistema tiene `canEdit=true`. Hasta que alguien la
// comparta como **Editor**, la lectura y la vista previa funcionan y la escritura devuelve 403.
// `ESCRITURA_SIN_PERMISO` traduce ese 403 a un mensaje que dice qué hacer, en vez de dejar un
// «Error 403» que nadie sabe cómo resolver.
//
// ── SOLO SE TOCAN DOS COLUMNAS ────────────────────────────────────────────────────────────────
//
// F (Pistolero) y S (Usuario). Nunca A, B ni C —las pone quien arma el esqueleto antes del
// turno— ni T, U o X, que son fórmulas. `escribirCeldas` lo verifica sobre lo que recibe: es la
// última barrera antes de la API, y una llamada mal armada tiene que fallar acá y no escribir
// media hoja. Ver `registroOlas.ts` para el porqué de cada columna.

import { google } from 'googleapis';
import { formulasDe } from '@/features/picking/planilla/esqueletoOlas';
import { fechaDeSerial, serialDeFecha, type Escritura, type FilaHoja }
  from '@/features/picking/planilla/registroOlas';

/**
 * El id de la planilla de olas.
 *
 * Va con valor por defecto en el código y no solo por entorno: es un documento fijo del negocio,
 * como lo son los nombres de las hojas. Sin el valor por defecto, olvidarse de la variable en
 * Vercel no daría un error visible — daría un botón que no encuentra el día y parece roto.
 */
const OLAS_ID = process.env.GOOGLE_OLAS_SPREADSHEET_ID
  ?? '1tVQ4L4Sdr7gdwZfo_AZ-qFjiyaKNHyybiWR1t2n38GM';

const HOJA = 'PICKING';

/** Las dos únicas columnas que este módulo escribe. */
const COLUMNAS_PERMITIDAS = new Set(['F', 'S']);

export class SinPermisoDeEscritura extends Error {
  constructor(public correo: string) {
    super(`La cuenta ${correo} puede leer la planilla de olas pero no escribirla. ` +
          'Hay que compartirle el documento como Editor.');
    this.name = 'SinPermisoDeEscritura';
  }
}

export class BloqueNoEncontrado extends Error {
  constructor(public fecha: string, public cercanas: string[]) {
    super(`No hay filas con fecha ${fecha} en la hoja ${HOJA}.`);
    this.name = 'BloqueNoEncontrado';
  }
}

function credenciales(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no configurado');
  return JSON.parse(raw) as { client_email: string; private_key: string };
}

function cliente(soloLectura: boolean) {
  const credentials = credenciales();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [soloLectura
      ? 'https://www.googleapis.com/auth/spreadsheets.readonly'
      : 'https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

/** El correo de la cuenta de servicio, para poder decir a quién hay que darle permiso. */
export function correoDeServicio(): string {
  try { return credenciales().client_email; } catch { return '(cuenta no configurada)'; }
}

export interface BloqueDia {
  /** La primera y la última fila del bloque, 1-based, tal como las numera la hoja. */
  desde: number;
  hasta: number;
  filas: FilaHoja[];
}

/**
 * El bloque de filas de un día.
 *
 * Se hace en dos lecturas y no en una: la hoja tiene ~36.000 filas con datos y traerlas enteras
 * con sus 19 columnas sería varios megas en cada clic. La primera lectura trae SOLO la columna A
 * —los seriales— para ubicar el rango, y la segunda trae ese rango completo.
 *
 * Exige que el bloque sea contiguo. Si el mismo día apareciera en dos tramos separados, se toma
 * el primero y el resto queda sin registrar; por eso `desde`/`hasta` se devuelven y la pantalla
 * los muestra: un bloque de 3 filas cuando el día tiene 29 tiendas se ve a simple vista.
 */
export async function leerBloqueDia(fecha: string): Promise<BloqueDia> {
  const gs = cliente(true);
  const objetivo = serialDeFecha(fecha);

  const colA = await gs.spreadsheets.values.get({
    spreadsheetId: OLAS_ID, range: `${HOJA}!A:A`, valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const seriales = (colA.data.values ?? []).map(f => Number(f?.[0]));

  let desde = -1, hasta = -1;
  for (let i = 0; i < seriales.length; i++) {
    if (seriales[i] !== objetivo) { if (desde >= 0) break; continue; }
    if (desde < 0) desde = i + 1;
    hasta = i + 1;
  }

  if (desde < 0) {
    // Qué fechas SÍ hay cerca del final, para que el aviso sea útil y no solo un «no está».
    const cercanas = [...new Set(seriales.slice(-200).map(fechaDeSerial).filter(Boolean) as string[])];
    throw new BloqueNoEncontrado(fecha, cercanas.slice(-4));
  }

  const r = await gs.spreadsheets.values.get({
    spreadsheetId: OLAS_ID, range: `${HOJA}!A${desde}:S${hasta}`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const filas: FilaHoja[] = (r.data.values ?? []).map((f, i) => ({
    fila: desde + i,
    tienda: String(f?.[1] ?? ''),
    seccion: String(f?.[2] ?? ''),
    pistolero: String(f?.[5] ?? ''),
    usuario: String(f?.[18] ?? ''),
  }));

  return { desde, hasta, filas };
}

/**
 * Escribe las celdas de un plan. Devuelve cuántas se escribieron.
 *
 * Una celda por rango y no un rango por bloque: las filas a escribir no son contiguas —una
 * tienda sin carga deja su fila vacía en el medio— y un rango continuo pisaría esas celdas con
 * vacío. `batchUpdate` las manda todas en UNA llamada igual.
 *
 * `RAW` y no `USER_ENTERED`: los nombres son texto y punto. Con `USER_ENTERED`, un nombre que
 * empezara con `=` o `+` se interpretaría como fórmula.
 */
export async function escribirCeldas(escrituras: Escritura[]): Promise<number> {
  if (escrituras.length === 0) return 0;

  const invalidas = escrituras.filter(e => !COLUMNAS_PERMITIDAS.has(e.columna));
  if (invalidas.length) {
    throw new Error(`Intento de escribir en columnas que no son F ni S: ` +
      [...new Set(invalidas.map(e => e.columna))].join(', '));
  }

  const gs = cliente(false);
  try {
    const r = await gs.spreadsheets.values.batchUpdate({
      spreadsheetId: OLAS_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: escrituras.map(e => ({
          range: `${HOJA}!${e.columna}${e.fila}`,
          values: [[e.valor]],
        })),
      },
    });
    return r.data.totalUpdatedCells ?? 0;
  } catch (e) {
    const codigo = (e as { code?: number; status?: number })?.code
      ?? (e as { status?: number })?.status;
    if (codigo === 403) throw new SinPermisoDeEscritura(correoDeServicio());
    throw e;
  }
}

/** Lo que hace falta saber del final de la hoja para poder agregar un día. */
export interface ColaHoja {
  /** La última fila con datos. El bloque nuevo arranca en la siguiente. */
  ultimaFila: number;
  /** La primera fila del último bloque: se usa como molde de formato y de validación. */
  moldeFila: number;
  /** El color de fondo de ese último bloque, para alternar. `null` si no se pudo leer. */
  colorAnterior: string | null;
}

const aHex = (c?: { red?: number | null; green?: number | null; blue?: number | null } | null): string | null =>
  c ? '#' + [c.red, c.green, c.blue]
        .map(v => Math.round((v ?? 0) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
    : null;

/**
 * Dónde termina la hoja y de qué color es el último día.
 *
 * El molde es la PRIMERA fila del último bloque y no una cualquiera: de ahí se copian el formato
 * de fecha, los bordes y las listas desplegables de las columnas B, C, F, G y H. Una fila creada
 * sin eso se vería distinta y perdería los desplegables, que es con lo que se llena a mano.
 */
export async function leerColaHoja(): Promise<ColaHoja> {
  const gs = cliente(true);
  const colA = await gs.spreadsheets.values.get({
    spreadsheetId: OLAS_ID, range: `${HOJA}!A:A`, valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const seriales = (colA.data.values ?? []).map(f => Number(f?.[0]));
  let ultimaFila = 0;
  for (let i = 0; i < seriales.length; i++) if (seriales[i]) ultimaFila = i + 1;
  if (!ultimaFila) throw new Error('La hoja PICKING no tiene ninguna fila con fecha');

  // Hacia atrás hasta que cambie el serial: ahí empieza el último bloque.
  const ultimo = seriales[ultimaFila - 1];
  let moldeFila = ultimaFila;
  while (moldeFila > 2 && seriales[moldeFila - 2] === ultimo) moldeFila--;

  const g = await gs.spreadsheets.get({
    spreadsheetId: OLAS_ID, ranges: [`${HOJA}!A${moldeFila}:A${moldeFila}`], includeGridData: true,
    fields: 'sheets.data.rowData.values.effectiveFormat.backgroundColor',
  });
  const color = aHex(g.data.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values?.[0]
    ?.effectiveFormat?.backgroundColor);

  return { ultimaFila, moldeFila, colorAnterior: color };
}

/** Una fila del bloque a crear, ya con su contenido de A, B y C. */
export interface FilaACrear { tienda: string; seccion: string }

/**
 * Crea el bloque de un día al final de la hoja y devuelve en qué filas quedó.
 *
 * El orden importa y es este:
 *
 * 1. **Copiar formato y validación** de la fila molde sobre el rango nuevo. Son dos pegados
 *    distintos: `PASTE_FORMAT` no trae las listas desplegables, para eso está
 *    `PASTE_DATA_VALIDATION`. Sin esto las filas nuevas pierden los desplegables de B, C, F, G
 *    y H, que es con lo que se completa a mano.
 * 2. **Pintar el fondo** del color que toca, encima del que vino en el formato copiado.
 * 3. **Escribir A, B y C** en RAW. La fecha va como NÚMERO DE SERIE y no como texto: la columna
 *    es numérica con formato de fecha, y un texto «11/11/2026» ahí se leería distinto según la
 *    configuración regional de la planilla — en una local en inglés, el 06/11 sería el 11 de
 *    junio.
 * 4. **Escribir las fórmulas** de T, U y X en USER_ENTERED, que es lo único que las interpreta
 *    como fórmula y no como texto.
 *
 * No se escribe nada entre D y S: esas quedan vacías, igual que en los días que arma una persona.
 */
export async function crearBloqueDia(
  fecha: string, filas: FilaACrear[], color: string, cola: ColaHoja,
): Promise<{ desde: number; hasta: number }> {
  if (filas.length === 0) throw new Error('No hay filas que crear');

  const gs = cliente(false);
  const desde = cola.ultimaFila + 1;
  const hasta = cola.ultimaFila + filas.length;
  const serial = serialDeFecha(fecha);

  const meta = await gs.spreadsheets.get({
    spreadsheetId: OLAS_ID, fields: 'sheets.properties(sheetId,title)' });
  const hoja = meta.data.sheets?.find(s => s.properties?.title === HOJA);
  const sheetId = hoja?.properties?.sheetId;
  if (sheetId == null) throw new Error(`No encontré la hoja ${HOJA}`);

  const rango = (r0: number, r1: number, c0: number, c1: number) =>
    ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 });
  const molde = rango(cola.moldeFila - 1, cola.moldeFila, 0, 25);   // A..Y
  const destino = rango(desde - 1, hasta, 0, 25);

  const rgb = (hex: string) => ({
    red: parseInt(hex.slice(1, 3), 16) / 255,
    green: parseInt(hex.slice(3, 5), 16) / 255,
    blue: parseInt(hex.slice(5, 7), 16) / 255,
  });

  try {
    await gs.spreadsheets.batchUpdate({
      spreadsheetId: OLAS_ID,
      requestBody: { requests: [
        { copyPaste: { source: molde, destination: destino, pasteType: 'PASTE_FORMAT' } },
        { copyPaste: { source: molde, destination: destino, pasteType: 'PASTE_DATA_VALIDATION' } },
        { repeatCell: {
            range: destino,
            cell: { userEnteredFormat: { backgroundColor: rgb(color) } },
            fields: 'userEnteredFormat.backgroundColor',
        } },
      ] },
    });

    await gs.spreadsheets.values.batchUpdate({
      spreadsheetId: OLAS_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: [{
          range: `${HOJA}!A${desde}:C${hasta}`,
          values: filas.map(f => [serial, f.tienda, f.seccion]),
        }],
      },
    });

    await gs.spreadsheets.values.batchUpdate({
      spreadsheetId: OLAS_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `${HOJA}!T${desde}:U${hasta}`,
            values: filas.map((_, i) => {
              const f = formulasDe(desde + i);
              return [f.T, f.U];
            }) },
          { range: `${HOJA}!X${desde}:X${hasta}`,
            values: filas.map((_, i) => [formulasDe(desde + i).X]) },
        ],
      },
    });
  } catch (e) {
    const codigo = (e as { code?: number; status?: number })?.code
      ?? (e as { status?: number })?.status;
    if (codigo === 403) throw new SinPermisoDeEscritura(correoDeServicio());
    throw e;
  }

  return { desde, hasta };
}
