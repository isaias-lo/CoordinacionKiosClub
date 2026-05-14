import { norm } from './helpers';
import { dkm } from './helpers';
import type { Vehiculo } from '../data/flota';
import type { TiendaInfo } from '../data/tiendas';
import type { Ruta } from './routing';

export async function fetchAuthenticatedSheet(sheet: string): Promise<{ values: string[][] }> {
  const res = await fetch(`/api/sheets?sheet=${encodeURIComponent(sheet)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export function fetchJSONP(sid: string, sheet: string): Promise<unknown> {
  return new Promise((res, rej) => {
    const cb = '_s' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const to = setTimeout(() => {
      delete (window as unknown as Record<string,unknown>)[cb];
      if (sc.parentNode) sc.parentNode.removeChild(sc);
      rej(new Error('Timeout'));
    }, 10000);
    (window as unknown as Record<string,unknown>)[cb] = (data: {table?: unknown}) => {
      clearTimeout(to);
      delete (window as unknown as Record<string,unknown>)[cb];
      if (sc.parentNode) sc.parentNode.removeChild(sc);
      data && data.table ? res(data.table) : rej(new Error('Sin datos'));
    };
    const sc = document.createElement('script');
    sc.src = `https://docs.google.com/spreadsheets/d/${sid}/gviz/tq?tqx=out:json;responseHandler:${cb}&sheet=${encodeURIComponent(sheet)}`;
    sc.onerror = () => { clearTimeout(to); delete (window as unknown as Record<string,unknown>)[cb]; rej(new Error('Error de red')); };
    try { document.head.appendChild(sc); } catch(e) { rej(e); }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseTSheet(t: any, tiendas: Record<string, TiendaInfo>, gps: Record<string, number[]>) {
  if (!t || !t.rows) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t.rows.forEach((r: any) => {
    if (!r.c || !r.c[0] || !r.c[0].v) return;
    const c = norm(String(r.c[0].v));
    if (!c || !/^[0-9]{0,2}[A-Z]{2,4}[0-9]?$/.test(c)) return;
    if (!tiendas[c]) tiendas[c] = { n: '', z: '', v: '' };
    if (r.c[1]?.v) tiendas[c].n = String(r.c[1].v);
    if (r.c[2]?.v) tiendas[c].d = String(r.c[2].v);
    if (r.c[3]?.v) tiendas[c].region = String(r.c[3].v);
    if (r.c[5]?.v) tiendas[c].z = String(r.c[5].v).trim();
    else if (r.c[4]?.v) tiendas[c].z = String(r.c[4].v).trim();
    if (r.c[5]?.v) tiendas[c].corredor = String(r.c[5].v).trim();
    if (r.c[6]?.v) tiendas[c].tipo = String(r.c[6].v);
    if (r.c[7]?.v) tiendas[c].v = String(r.c[7].v);
    if (r.c[8]?.v) tiendas[c].frecuencia = String(r.c[8].v);
    // index 12 = CORREOS (added between LON and TEL ENCARGADO)
    if (r.c[12]?.v) tiendas[c].correos = String(r.c[12].v);
    if (r.c[13]?.v) tiendas[c].tel_encargado = String(r.c[13].v);
    if (r.c[14]?.v) tiendas[c].supervisor = String(r.c[14].v);
    if (r.c[15]?.v) tiendas[c].tel_supervisor = String(r.c[15].v);
    if (r.c[16]?.v) tiendas[c].transportista = String(r.c[16].v);
    tiendas[c].activo = (r.c[17]?.v ? String(r.c[17].v).toUpperCase().trim() : 'SI') !== 'NO';
    const lat = r.c[10]?.v ? parseFloat(String(r.c[10].v).replace(',','.')) : null;
    const lon = r.c[11]?.v ? parseFloat(String(r.c[11].v).replace(',','.')) : null;
    if (lat && lon && !isNaN(lat) && !isNaN(lon) && lat > -60 && lat < -17 && lon > -76 && lon < -66) {
      gps[c] = [lat, lon];
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseFSheet(t: any, flota: Vehiculo[]) {
  if (!t || !t.rows) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t.rows.forEach((r: any) => {
    if (!r.c || !r.c[0] || !r.c[0].v) return;
    const patUpper = String(r.c[0].v).trim().toUpperCase();
    const existente = flota.find(v => v.p.toUpperCase() === patUpper);
    if (existente) {
      if (r.c[1]?.v) existente.c = parseInt(r.c[1].v) || existente.c;
      if (r.c[2]?.v) existente.b = parseInt(r.c[2].v) || existente.b;
      if (r.c[3]?.v) existente.t = String(r.c[3].v);
      if (r.c[6]?.v) existente.on = String(r.c[6].v).toUpperCase() === 'SI';
      if (r.c[7]?.v) existente.tlbd = String(r.c[7].v).toUpperCase() === 'SI';
      if (r.c[8]?.v) existente.ch = String(r.c[8].v);
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseCalendario(t: any): Record<string, {rm:string[];costa:string[];fal:string[]}> | null {
  if (!t || !t.rows) return null;
  const cal: Record<string, {rm:string[];costa:string[];fal:string[]}> = {};
  const DIAS = ['LU','MA','MI','JU','VI','SA'];
  DIAS.forEach(d => { cal[d] = {rm:[],costa:[],fal:[]}; });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t.rows.forEach((r: any) => {
    if (!r.c) return;
    const dia = r.c[0]?.v ? String(r.c[0].v).toUpperCase().trim() : '';
    const grp = r.c[1]?.v ? String(r.c[1].v).toLowerCase().trim() : '';
    const cod = r.c[2]?.v ? norm(String(r.c[2].v)) : '';
    if (dia && grp && cod && cal[dia] && (grp === 'rm' || grp === 'costa' || grp === 'fal')) {
      cal[dia][grp as 'rm'|'costa'|'fal'].push(cod);
    }
  });
  return cal;
}

// ── Authenticated API Parsers ───────────────────────────────────────
export function parseTSheetAuth(values: string[][], tiendas: Record<string, TiendaInfo>, gps: Record<string, number[]>) {
  if (!values || values.length < 3) return;

  // Skip header rows, find data starting from row 2 (index 2)
  for (let i = 2; i < values.length; i++) {
    const row = values[i];
    if (!row || row.length < 3) continue;

    const cod = norm(row[0]);
    if (!cod || !/^[0-9]{0,2}[A-Z]{2,4}[0-9]?$/.test(cod)) continue;

    if (!tiendas[cod]) tiendas[cod] = { n: '', z: '', v: '' };
    if (row[1]) tiendas[cod].n = row[1];
    if (row[2]) tiendas[cod].d = row[2];
    if (row[3]) tiendas[cod].region = row[3];
    if (row[5]) tiendas[cod].z = row[5].trim();
    else if (row[4]) tiendas[cod].z = row[4].trim();
    if (row[5]) tiendas[cod].corredor = row[5].trim();
    if (row[6]) tiendas[cod].tipo = row[6];
    if (row[7]) tiendas[cod].v = row[7];
    if (row[8]) tiendas[cod].frecuencia = row[8];
    // index 12 = CORREOS (added between LON and TEL ENCARGADO)
    if (row[12]) tiendas[cod].correos = row[12];
    if (row[13]) tiendas[cod].tel_encargado = row[13];
    if (row[14]) tiendas[cod].supervisor = row[14];
    if (row[15]) tiendas[cod].tel_supervisor = row[15];
    if (row[16]) tiendas[cod].transportista = row[16];
    const actVal = row[17] ? row[17].toUpperCase().trim() : 'SI';
    tiendas[cod].activo = actVal !== 'NO';

    const lat = row[10] ? parseFloat(row[10].replace(',', '.')) : null;
    const lon = row[11] ? parseFloat(row[11].replace(',', '.')) : null;
    if (lat && lon && !isNaN(lat) && !isNaN(lon) && lat > -60 && lat < -17 && lon > -76 && lon < -66) {
      gps[cod] = [lat, lon];
    }
  }
}

export function parseFSheetAuth(values: string[][], flota: Vehiculo[]) {
  if (!values || values.length < 3) return;
  
  for (let i = 2; i < values.length; i++) {
    const row = values[i];
    if (!row || row.length < 3) continue;
    
    const patUpper = row[0]?.trim().toUpperCase() || '';
    if (!patUpper) continue;
    
    const existente = flota.find(v => v.p.toUpperCase() === patUpper);
    if (existente) {
      if (row[1]) existente.c = parseInt(row[1]) || existente.c;
      if (row[2]) existente.b = parseInt(row[2]) || existente.b;
      if (row[3]) existente.t = row[3];
      if (row[6]) existente.on = row[6].toUpperCase() === 'SI';
      if (row[7]) existente.tlbd = row[7].toUpperCase() === 'SI';
      if (row[8]) existente.ch = row[8];
    }
  }
}

export function parseCalendarioAuth(values: string[][]): Record<string, {rm:string[];costa:string[];fal:string[]}> | null {
  if (!values || values.length === 0) return null;
  
  const cal: Record<string, {rm:string[];costa:string[];fal:string[]}> = {};
  const DIAS = ['LU','MA','MI','JU','VI','SA'];
  DIAS.forEach(d => { cal[d] = {rm:[],costa:[],fal:[]}; });
  
  // Buscar fila con "GRUPO" en columna 0
  let headerRow = -1;
  for (let i = 0; i < values.length; i++) {
    if (values[i] && values[i][0] === 'GRUPO') {
      headerRow = i;
      break;
    }
  }
  
  if (headerRow < 0) return null;
  
  // Códigos numéricos de Costa y Falcón/Región
  const COSTA_CODES = new Set(['37VIN','08RNC','33CON','43CUR','54MPQ']);
  const FAL_CODES   = new Set(['46TRE','28TEM','75PUC','53VAL','47PTV','50PTM','39PSB','41ANA','42ANP','31TLC','36CHL','24SPP','38SP2','76PAN','51SER','27MCH']);

  // Columnas: 0=GRUPO, 1=TIPO, 2=LUNES, 3=MARTES, 4=MIÉRCOLES, 5=JUEVES, 6=VIERNES, 7=SÁBADO
  const diaCols: Record<number, string> = { 2: 'LU', 3: 'MA', 4: 'MI', 5: 'JU', 6: 'VI', 7: 'SA' };

  // Procesar cada fila de tiendas
  for (let i = headerRow + 1; i < values.length; i++) {
    const row = values[i];
    if (!row) continue;

    const col0 = row[0] ? String(row[0]).trim() : '';
    const col1 = row[1] ? String(row[1]).trim().toUpperCase() : '';

    // Ignorar filas especiales
    if (col0.includes('📦') || col0.includes('FLOTA') || (col0 === '' && (col1.includes('ARMADO') || col1.includes('TOTAL') || col1.includes('DESTINO')))) {
      continue;
    }

    // Para cada día, leer las tiendas
    for (let j = 2; j <= 7; j++) {
      const diaKey = diaCols[j];
      if (!diaKey) continue;

      const tiendasStr = row[j];
      if (!tiendasStr) continue;

      // norm() normaliza acentos y mapea códigos cortos→numéricos vía ALIAS
      const partes = String(tiendasStr).split(/[\s,;]+/)
        .map(t => norm(t.trim()))
        .filter(t => t && /^[0-9]{0,2}[A-Z]{2,4}[0-9]?$/.test(t));

      partes.forEach(t => {
        if (COSTA_CODES.has(t)) {
          cal[diaKey].costa.push(t);
        } else if (FAL_CODES.has(t)) {
          cal[diaKey].fal.push(t);
        } else {
          cal[diaKey].rm.push(t);
        }
      });
    }
  }
  
  // Limpiar duplicados
  DIAS.forEach(dia => {
    (['rm','costa','fal'] as const).forEach(grp => {
      cal[dia][grp] = [...new Set(cal[dia][grp])];
    });
  });
  
  return cal;
}

// ── Despacho RM → Base de Datos ──────────────────────────────────────────────

const URBAN_RM = new Set([
  'Santiago','Providencia','Las Condes','Vitacura','Ñuñoa','Maipú',
  'La Florida','Quilicura','Huechuraba','La Reina','Lo Barnechea','Puente Alto',
]);

// Columnas: ID,FECHA,COD,TIENDA,TIPO,REGIMEN,TRANSPORTE,CARGA,REGION,COMUNA,
//           TIPO_COMUNA,PESO_KG,ALTO,LARGO,ANCHO,PESO_V,VENTANA,ESTADO,
//           N_PALLET_BULTO,FECHA_LLEGADA,CONDUCTOR,RUTA,SUPERVISOR
export function guardarDespachoRMFn(params: {
  fecha: string;
  supervisor: string;
  rutas: Ruta[];
  tiendas: Record<string, TiendaInfo>;
}): void {
  const { fecha, supervisor, rutas, tiendas } = params;
  if (!rutas?.length) return;

  const now   = new Date();
  const dd    = String(now.getDate()).padStart(2, '0');
  const mm    = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy  = String(now.getFullYear());
  const stamp = `${dd}${mm}${yyyy}`;

  const rows: (string | number)[][] = [];

  rutas.forEach((ruta, ri) => {
    const conductor  = ruta._choferAsignado || ruta.v.ch || '';
    const vehiculo   = ruta.v.p;
    const rutaNum    = ri + 1;

    ruta.ts.forEach(ts => {
      const info   = tiendas[ts.c];
      const nombre = info?.n ?? ts.c;
      const zona   = info?.z ?? '';
      const tipoCom = URBAN_RM.has(zona) ? 'Urbano' : 'Urbano'; // Santiago siempre urbano

      // Fila pallets
      if (ts.p > 0) {
        rows.push([
          `${rutaNum}${ts.c}${stamp}P`,   // ID
          fecha,                           // FECHA
          ts.c,                            // COD
          nombre,                          // TIENDA
          'Pallet',                        // TIPO
          'Carga',                         // REGIMEN
          vehiculo,                        // TRANSPORTE
          '',                              // CARGA
          'REGIÓN METROPOLITANA',          // REGION
          zona,                            // COMUNA
          tipoCom,                         // TIPO_COMUNA
          '', '', '', '', '',              // PESO_KG, ALTO, LARGO, ANCHO, PESO_V
          '',                              // VENTANA
          'Listo para despachar',          // ESTADO
          ts.p,                            // N_PALLET_BULTO
          '',                              // FECHA_LLEGADA
          conductor,                       // CONDUCTOR
          rutaNum,                         // RUTA
          supervisor,                      // SUPERVISOR
        ]);
      }

      // Fila bultos
      if (ts.b > 0) {
        rows.push([
          `${rutaNum}${ts.c}${stamp}B`,
          fecha,
          ts.c,
          nombre,
          'Bulto',
          'Carga',
          vehiculo,
          '',
          'REGIÓN METROPOLITANA',
          zona,
          tipoCom,
          '', '', '', '', '',
          '',
          'Listo para despachar',
          ts.b,
          '',
          conductor,
          rutaNum,
          supervisor,
        ]);
      }
    });
  });

  if (!rows.length) return;

  fetch('/api/sheets-write', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ sheet: 'DESPACHO RM', rows }),
  }).catch(err => console.error('[guardarDespachoRM]', err));
}

interface GuardarHistorialParams {
  fecha: string;
  supervisor: string;
  rutas: Ruta[];
  ts: {c:string;p:number;b:number}[];
  gps: Record<string, number[]>;
  cd: number[];
  kmTotalReal: number | null;
  sheetsWebAppUrl: string;
  onStart: () => void;
  onSuccess: (msg: string) => void;
  onWarn: (msg: string) => void;
  onError: (msg: string) => void;
}

export function guardarHistorialFn(params: GuardarHistorialParams) {
  const { fecha, supervisor, rutas, ts, gps, cd, kmTotalReal, sheetsWebAppUrl, onStart, onSuccess, onWarn, onError } = params;
  if (!rutas?.length) { onWarn('⚠️ No hay rutas calculadas.'); return; }
  onStart();
  const tp = ts.reduce((s,t)=>s+t.p,0);
  const tb = ts.reduce((s,t)=>s+t.b,0);
  let kmTotal = 0;
  if (kmTotalReal) { kmTotal = kmTotalReal; }
  else {
    rutas.forEach(r => {
      let prev = cd;
      r.ts.forEach(t => { const g=gps[t.c]; if(g){kmTotal+=dkm(prev,g);prev=g;} });
    });
    kmTotal = Math.round(kmTotal*10)/10;
  }

  const resumen = rutas.map((r,i) => ({
    ruta: i+1, vehiculo: r.v.p, conductor: r._choferAsignado||r.v.ch||'',
    tiendas: r.ts.map(t=>t.c).join(','), pallets: r.tp, bultos: r.tb,
    kmReal: r._kmReal || '',
  }));

  const payload = {
    accion: 'guardarHistorial', fecha, supervisor,
    totalTiendas: ts.length, totalPallets: tp, totalBultos: tb,
    totalRutas: rutas.length, kmTotal, resumen,
  };

  fetch(sheetsWebAppUrl, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(() => onSuccess(`✓ Historial guardado · ${fecha} · ${ts.length} tiendas · ${tp}P+${tb}B · ${kmTotal}km`))
    .catch(e => onError(`Error al guardar: ${e.message}`));
}

interface GuardarFlotaParams {
  flota: Vehiculo[];
  sheetsWebAppUrl: string;
  onStart: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export function guardarFlotaFn({ flota, sheetsWebAppUrl, onStart, onSuccess, onError }: GuardarFlotaParams) {
  onStart();
  fetch(sheetsWebAppUrl, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'guardarFlota', flota }),
  })
    .then(() => onSuccess('✓ Flota guardada'))
    .catch(e => onError(`Error: ${e.message}`));
}