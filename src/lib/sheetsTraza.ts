/**
 * sheetsTraza.ts
 * Fire-and-forget helper para sincronizar trazabilidad_unidades → hoja TRAZABILIDAD.
 * Nunca lanza errores (efectos secundarios).
 */

import { google } from 'googleapis';
import type { TrazabilidadUnidad } from './trazabilidad.types';

const SPREADSHEET_ID =
  process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

const SHEET_NAME = 'TRAZABILIDAD';

// Nombres de columnas — mismo orden que los valores construidos en buildRow().
const HEADERS = [
  'id_unidad_logistica',     // A
  'tipo_unidad',             // B
  'codigo_tienda',           // C
  'tienda_destino',          // D
  'comuna_destino',          // E
  'region_destino',          // F
  'transportista',           // G
  'regimen',                 // H
  'tipo_carga',              // I
  'peso_kg',                 // J
  'alto_cm',                 // K
  'ancho_cm',                // L
  'largo_cm',                // M
  'volumen_m3',              // N
  'ventana_horaria_recepcion', // O
  'fecha_hora_creacion',     // P
  'fecha_hora_despacho',     // Q
  'fecha_tentativa_llegada', // R
  'fecha_hora_real_llegada', // S
  'indicador_llegada_tiempo', // T
  'minutos_desfase',         // U
  'temperatura_salida',      // V
  'temperatura_llegada',     // W
  'alerta_temperatura',      // X
  'estado_actual',           // Y
  'tipo_incidencia',         // Z
  'descripcion_incidencia',  // AA
  'estado_resolucion',       // AB
  'observaciones',           // AC
  'usuario_creador',         // AD
  'usuario_despacho',        // AE
  'usuario_recepcion',       // AF
];

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no configurado');
  const clean = raw.replace(/[０-９]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  );
  return JSON.parse(clean);
}

async function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

/** Convierte un valor de campo a string para Sheets (null/undefined → ''). */
function v(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val);
}

/** Construye el array de 32 valores en el orden definido por HEADERS. */
function buildRow(data: Partial<TrazabilidadUnidad>): string[] {
  return [
    v(data.id_unidad_logistica),
    v(data.tipo_unidad),
    v(data.codigo_tienda),
    v(data.tienda_destino),
    v(data.comuna_destino),
    v(data.region_destino),
    v(data.transportista),
    v(data.regimen),
    v(data.tipo_carga),
    v(data.peso_kg),
    v(data.alto_cm),
    v(data.ancho_cm),
    v(data.largo_cm),
    v(data.volumen_m3),
    v(data.ventana_horaria_recepcion),
    v(data.fecha_hora_creacion),
    v(data.fecha_hora_despacho),
    v(data.fecha_tentativa_llegada),
    v(data.fecha_hora_real_llegada),
    v(data.indicador_llegada_tiempo),
    v(data.minutos_desfase),
    v(data.temperatura_salida),
    v(data.temperatura_llegada),
    v(data.alerta_temperatura),
    v(data.estado_actual),
    v(data.tipo_incidencia),
    v(data.descripcion_incidencia),
    v(data.estado_resolucion),
    v(data.observaciones),
    v(data.usuario_creador),
    v(data.usuario_despacho),
    v(data.usuario_recepcion),
  ];
}

/**
 * Upsert de una fila en la hoja TRAZABILIDAD.
 * - Si ya existe una fila con el mismo id_unidad_logistica → la actualiza.
 * - Si no existe → crea la hoja si hace falta, escribe cabeceras y append.
 * Es fire-and-forget: nunca lanza errores hacia el caller.
 */
export async function upsertTrazabilidadSheet(
  data: Partial<TrazabilidadUnidad>
): Promise<void> {
  try {
    if (!data.id_unidad_logistica) {
      console.error('[sheetsTraza] id_unidad_logistica requerido');
      return;
    }

    const auth = await getAuth();
    const gs = google.sheets({ version: 'v4', auth });

    // 1. Leer columna A para buscar la fila existente
    const colARes = await gs.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:A`,
    });

    const colA = colARes.data.values ?? [];

    // Buscar fila (saltamos fila 0 que puede ser cabecera)
    let foundRowIndex = -1;
    for (let i = 0; i < colA.length; i++) {
      if (colA[i]?.[0] === data.id_unidad_logistica) {
        foundRowIndex = i;
        break;
      }
    }

    const rowValues = buildRow(data);

    if (foundRowIndex >= 0) {
      // 2a. Actualizar fila existente (1-indexed en Sheets)
      const rowNumber = foundRowIndex + 1;
      await gs.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A${rowNumber}:AF${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [rowValues] },
      });
    } else {
      // 2b. Append — primero verificar si la hoja existe
      const metaRes = await gs.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
        fields: 'sheets.properties.title',
      });

      const sheets = metaRes.data.sheets ?? [];
      const sheetExists = sheets.some(
        s => s.properties?.title === SHEET_NAME
      );

      if (!sheetExists) {
        // Crear la hoja
        await gs.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: { title: SHEET_NAME },
                },
              },
            ],
          },
        });

        // Insertar cabeceras como primera fila
        await gs.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A1`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [HEADERS] },
        });
      }

      // Append la fila de datos
      await gs.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [rowValues] },
      });
    }
  } catch (err) {
    console.error('[sheetsTraza]', err);
  }
}
