import { dkm } from './helpers';
import { PROVIDENCIA, REGION_V, CORREDOR_AUTOPISTA } from '../data/tiendas';
import type { Vehiculo } from '../data/flota';
import type { TiendaInfo } from '../data/tiendas';

export interface StoreItem { c: string; p: number; b: number; _v?: string; }
export interface Ruta { v: Vehiculo; ts: StoreItem[]; tp: number; tb: number; _choferAsignado?: string; _kmReal?: number; }

export function nn(tiendas: StoreItem[], gps: Record<string, number[]>, cd: number[]): StoreItem[] {
  if (tiendas.length <= 1) return tiendas;
  let pend = tiendas.slice(), ruta: StoreItem[] = [];
  let cur = cd;
  while (pend.length) {
    let md = Infinity, mi = 0;
    pend.forEach((t, i) => {
      const g = gps[t.c]; if (!g) return;
      const d = dkm(cur, g);
      let cierre = 999;
      const v = t._v || '';
      if (v) { const p = v.split('-')[1]; if (p) { const h = p.split(':'); cierre = parseInt(h[0])*60+(parseInt(h[1])||0); } }
      const bonus = (cierre <= 570 && ruta.length < 2) ? -50 : 0;
      if (d + bonus < md) { md = d + bonus; mi = i; }
    });
    const nx = pend.splice(mi, 1)[0];
    if (gps[nx.c]) cur = gps[nx.c];
    ruta.push(nx);
  }
  return ruta;
}

export function asignar(
  tiendas: StoreItem[],
  flota: Vehiculo[],
  gps: Record<string, number[]>,
  cd: number[],
  prov?: Set<string> | null,
  regV?: Set<string> | null,
  autoSets?: Set<string> | null,
  tiendasData?: Record<string, TiendaInfo>,
): Ruta[] {
  const _prov  = prov  || PROVIDENCIA;
  const _regV  = regV  || REGION_V;
  const _auto  = autoSets || CORREDOR_AUTOPISTA;

  const ts = tiendas.map(t => ({
    ...t,
    _v: tiendasData?.[t.c]?.v ?? '',
  }));

  const disp  = flota.filter(v => v.on && !v.tlbd);
  const tlbds = flota.filter(v => v.on && v.tlbd);
  if (!disp.length) return [];

  const totalP = ts.reduce((s, t) => s + t.p, 0);

  const asignadas: Record<string, number> = {};

  const tRegV  = ts.filter(t => _regV.has(t.c));
  tRegV.forEach(t => { asignadas[t.c] = 1; });

  const tAuto  = ts.filter(t => _auto.has(t.c) && !asignadas[t.c]);
  tAuto.forEach(t => { asignadas[t.c] = 1; });

  const tProv  = ts.filter(t => _prov.has(t.c) && !asignadas[t.c]);
  tProv.forEach(t => { asignadas[t.c] = 1; });

  const GRUPO_SUR_SET: Record<string,number>  = {CFL:1,FLO:1,PTA:1,PEN:1,SMB:1};
  const tSur   = ts.filter(t => GRUPO_SUR_SET[t.c] && !asignadas[t.c]);
  tSur.forEach(t => { asignadas[t.c] = 1; });

  const GRUPO_NORTE_SET: Record<string,number> = {PIE:1,TPS:1,TRQ:1,PQA:1,EST:1,LP:1};
  const tNorte = ts.filter(t => GRUPO_NORTE_SET[t.c] && !asignadas[t.c]);
  tNorte.forEach(t => { asignadas[t.c] = 1; });

  const tCentro = ts.filter(t => !asignadas[t.c]);

  const nGrupos =
    (tRegV.length ? 1 : 0) + (tAuto.length ? 1 : 0) +
    (tProv.length ? 1 : 0) + (tSur.length  ? 1 : 0) +
    (tNorte.length  ? Math.ceil(tNorte.reduce((s,t)=>s+t.p,0)/10) : 0) +
    (tCentro.length ? Math.ceil(tCentro.reduce((s,t)=>s+t.p,0)/10) : 0);
  let nOpt = Math.max(nGrupos, Math.ceil(totalP / 10));
  nOpt = Math.min(nOpt, disp.length);

  const rutas: Ruta[] = disp.slice(0, nOpt).map(v => ({v, ts:[], tp:0, tb:0}));

  function asignarGrupo(tGrupo: StoreItem[], excluir: Ruta[]): Ruta | null {
    if (!tGrupo.length) return null;
    const cap = tGrupo.reduce((s,t) => s+t.p, 0);
    let cands = rutas.filter(r => !excluir.includes(r) && r.tp === 0 && r.v.c >= cap);
    if (!cands.length) cands = rutas.filter(r => !excluir.includes(r) && r.tp+cap <= r.v.c);
    if (!cands.length) return null;
    const ruta = cands[0];
    nn(tGrupo, gps, cd).forEach(t => { ruta.ts.push(t); ruta.tp+=t.p; ruta.tb+=t.b; });
    return ruta;
  }

  const usadas: Ruta[] = [];
  const rutaRegV = asignarGrupo(tRegV,  usadas); if (rutaRegV)  usadas.push(rutaRegV);
  const rutaAuto = asignarGrupo(tAuto,  usadas); if (rutaAuto)  usadas.push(rutaAuto);
  const rutaProv = asignarGrupo(tProv,  usadas); if (rutaProv)  usadas.push(rutaProv);
  const rutaSur  = asignarGrupo(tSur,   usadas); if (rutaSur)   usadas.push(rutaSur);

  let tNorteTemp: StoreItem[] = tNorte.slice();
  while (tNorteTemp.length) {
    const chunk: StoreItem[] = []; let cap = 0; const resto: StoreItem[] = [];
    const ordenado = nn(tNorteTemp, gps, cd);
    ordenado.forEach(t => {
      if (cap + t.p <= 10) { chunk.push(t); cap += t.p; }
      else resto.push(t);
    });
    if (!chunk.length) { tNorteTemp.forEach(t => chunk.push(t)); tNorteTemp = []; }
    else tNorteTemp = resto;
    const r2 = asignarGrupo(chunk, usadas);
    if (r2) usadas.push(r2);
    else {
      const ov = rutas.filter(r => !usadas.includes(r)).sort((a,b) => a.tp-b.tp)[0] || rutas[0];
      chunk.forEach(t => { ov.ts.push(t); ov.tp+=t.p; ov.tb+=t.b; });
    }
  }

  tCentro.forEach(t => {
    const cands = rutas.filter(r => !usadas.includes(r) && r.tp+t.p <= r.v.c)
                       .sort((a,b) => (b.tp/b.v.c)-(a.tp/a.v.c));
    if (cands.length) { cands[0].ts.push(t); cands[0].tp+=t.p; cands[0].tb+=t.b; }
    else {
      const ov = rutas.sort((a,b) => a.tp-b.tp)[0];
      ov.ts.push(t); ov.tp+=t.p; ov.tb+=t.b;
    }
  });

  rutas.forEach(r => {
    if (r !== rutaAuto && r.ts.length > 1) r.ts = nn(r.ts, gps, cd);
  });

  if (rutaAuto && rutaAuto.ts.length > 1) {
    rutaAuto.ts.sort((a,b) => dkm(cd, gps[a.c]||cd) - dkm(cd, gps[b.c]||cd));
  }

  if (tlbds.length) {
    const tl = tlbds[0];
    const tlr: Ruta = {v: tl, ts:[], tp:0, tb:0};
    rutas.forEach(r => {
      if (r.tp > r.v.c) {
        r.ts.sort((a,b) => a.p-b.p);
        while (r.tp > r.v.c && tlr.tp < tl.c && r.ts.length) {
          const x = r.ts.shift()!; r.tp -= x.p; r.tb -= x.b;
          if (tlr.tp + x.p <= tl.c) { tlr.ts.push(x); tlr.tp+=x.p; tlr.tb+=x.b; }
          else { r.ts.unshift(x); break; }
        }
      }
    });
    if (tlr.ts.length) rutas.push(tlr);
  }

  return rutas.filter(r => r.ts.length > 0);
}
