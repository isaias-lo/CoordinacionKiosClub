import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtener __dirname en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── CONFIGURACIÓN ─────────────────────────────────────────────
const SHEETS_ID = '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly'
];
// ── AUTENTICACIÓN ──────────────────────────────────────────────
async function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: SCOPES,
  });
  return await auth.getClient();
}
// ── LEER HOJA ─────────────────────────────────────────────────
async function leerHoja(sheets, hoja) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEETS_ID,
    range: hoja,
  });
  return response.data.values; // Array de arrays
}

// ── CARGAR CALENDARIO ───────────────────────────────────────────
async function cargarCalendario(sheets) {
  const cal = await leerHoja(sheets, 'CALENDARIO');
  if (!cal || cal.length < 2) return null;

  // Buscar la fila que tiene "GRUPO" en primera columna
  let headerRow = -1;
  for (let i = 0; i < cal.length; i++) {
    if (cal[i][0] === 'GRUPO') {
      headerRow = i;
      break;
    }
  }

  if (headerRow < 0) return null;

  const resultado = {};
  ['LU','MA','MI','JU','VI','SA'].forEach(dia => {
    resultado[dia] = { rm: [], costa: [], fal: [] };
  });

  // Las columnas son: 0=GRUPO, 1=TIPO, 2=LUNES, 3=MARTES, 4=MIÉRCOLES, 5=JUEVES, 6=VIERNES
  const diaCols = { 2: 'LU', 3: 'MA', 4: 'MI', 5: 'JU', 6: 'VI'};
  const COSTA_CODES = new Set(['VIN','RNC','CON','CUR']);
  const FAL_CODES = new Set(['TRE','TEM','PUC','VAL','PTV','PTM','PSB','ANA','ANP','TLC','CHL','SPP','SP2','PAN','SER']);

  // Procesar cada fila de tiendas
  for (let i = headerRow + 1; i < cal.length; i++) {
    const row = cal[i];
    if (!row) continue;

    const col0 = row[0] ? String(row[0]).trim() : '';
    const col1 = row[1] ? String(row[1]).trim().toUpperCase() : '';

    // Ignorar filas especiales
    if (col0.includes('📦') || col0.includes('FLOTA') || col0 === '' && col1.includes('ARMADO') || col1.includes('TOTAL') || col1.includes('DESTINO')) {
      continue;
    }

    // Para cada día, leer las tiendas
    for (let j = 2; j <= 7; j++) {
      const diaKey = diaCols[j];
      if (!diaKey) continue;
      
      const tiendasStr = row[j];
      if (!tiendasStr) continue;
      
      // Limpiar y obtener códigos de tienda
      const partes = String(tiendasStr).split(/[\s,;]+/).map(t => t.trim().toUpperCase()).filter(t => t && /^[A-Z0-9]{2,4}$/.test(t));
      
      partes.forEach(t => {
        if (COSTA_CODES.has(t)) {
          resultado[diaKey].costa.push(t);
        } else if (FAL_CODES.has(t)) {
          resultado[diaKey].fal.push(t);
        } else if (t.length >= 2 && t.length <= 4) {
          resultado[diaKey].rm.push(t);
        }
      });
    }
  }

  // Limpiar duplicados
  ['LU','MA','MI','JU','VI','SA'].forEach(dia => {
    ['rm','costa','fal'].forEach(grp => {
      resultado[dia][grp] = [...new Set(resultado[dia][grp])];
    });
  });

  console.log('✅ Calendario parseado:');
  console.log('  LU rm:', resultado.LU.rm.length, 'tiendas');
  console.log('  LU costa:', resultado.LU.costa.length, 'tiendas');
  console.log('  LU fal:', resultado.LU.fal.length, 'tiendas');
  
  return resultado;
}

// ── FUNCIÓN PRINCIPAL ──────────────────────────────────────────
async function cargarDatos() {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  // Leer TIENDAS (fila 1=título, fila 2=headers, fila 3+=datos)
  const lojas = await leerHoja(sheets, 'TIENDAS');
  const headersTiendas = lojas[1]; // fila 2 = headers
  const datosTiendas = lojas.slice(2).map(row => {
    const obj = {};
    headersTiendas.forEach((col, i) => {
      obj[col.trim()] = row[i] || '';
    });
    return obj;
  }).filter(t => t['CÓDIGO'] && t['ACTIVO'] !== 'NO');

  // Leer FLOTA
  const flota = await leerHoja(sheets, 'FLOTA');
  const headersFlota = flota[1];
  const datosFlota = flota.slice(2).map(row => {
    const obj = {};
    headersFlota.forEach((col, i) => {
      obj[col.trim()] = row[i] || '';
    });
    return obj;
  }).filter(v => v['PATENTE']);

  // Leer CALENDARIO
  const calendario = await cargarCalendario(sheets);

  console.log(`✅ Tiendas cargadas: ${datosTiendas.length}`);
  console.log(`✅ Vehículos cargados: ${datosFlota.length}`);
  console.log(`✅ Calendario${calendario ? ' cargado' : ' no encontrado'}`);

  return { tiendas: datosTiendas, flota: datosFlota, calendario };
}

// ── EJECUTAR ───────────────────────────────────────────────────
cargarDatos()
  .then(({ tiendas, flota, calendario }) => {
    // Ejemplo: mostrar primera tienda
    console.log('\nPrimera tienda:', tiendas[0]);
    console.log('Primera patente:', flota[0]);
    if (calendario) {
      console.log('\nCalendario LU:', JSON.stringify(calendario.LU));
    }
  })
  .catch(err => console.error('Error:', err.message));