import { norm } from './helpers';
import { dkm } from './helpers';
import type { Vehiculo } from '../data/flota';
import type { TiendaInfo } from '../data/tiendas';
import type { Ruta } from './routing';

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
    if (!c || c.length < 2 || c.length > 4) return;
    if (!tiendas[c]) tiendas[c] = { n: '', z: '', v: '' };
    if (r.c[1]?.v) tiendas[c].n = String(r.c[1].v);
    if (r.c[5]?.v) tiendas[c].z = String(r.c[5].v).trim();
    else if (r.c[4]?.v) tiendas[c].z = String(r.c[4].v).trim();
    if (r.c[7]?.v) tiendas[c].v = String(r.c[7].v);
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
