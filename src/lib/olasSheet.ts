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
