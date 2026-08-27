// [E5] ENRUTADOR v2 — asignación tienda→camión por AHORRO GEOGRÁFICO (Clarke-Wright) con
// restricciones reales de operación (compacidad + ventanas horarias) y pulido 2-opt del orden.
//
// POR QUÉ EXISTE (medido sobre 60 días reales de despacho_rm, contra lo que armó el coordinador):
//
//   estrategia                    km/día   camiones/día   diámetro   ventanas incumplidas/día
//   coordinador (humano)            133         3.9        14.1 km            3.6
//   asignar() (v1)                  166         4.6        11.5 km            1.5     (+24.8%)
//   este módulo                     115         4.0         9.0 km            0.0     (-13.8%)
//
// La causa del sobrecosto de v1: sus buckets curados GRUPO_SUR_SET/GRUPO_NORTE_SET usan códigos
// cortos legacy ('FLO','PIE') que YA NO existen — los códigos reales son '18FLO','13PIE'. Capturan
// 0 tiendas, así que el 82% del pool cae al bucket genérico "Centro", que reparte por CAPACIDAD y
// sin ninguna noción de geografía. Este módulo reemplaza esa repartición.
//
// Todo acá es PURO y testeable: sin red, sin estado, sin DOM. Determinista — el mismo pool produce
// siempre la misma propuesta (los empates se rompen por código de tienda).

import { dkm } from './helpers';
import type { StoreItem, Ruta } from './routing';
import type { Vehiculo } from '../data/flota';
import type { TiendaInfo } from '../data/tiendas';

export interface OpcionesEnrutador {
  /** Máx. km entre las 2 tiendas más lejanas de un mismo camión. Mantiene rutas operables
   *  (una ruta corta en km pero "estirada" es imposible de cumplir en ventana). 0 = sin límite. */
  maxDiametroKm?: number;
  /** Rechaza fusiones que hagan llegar tarde a alguna tienda según su ventana. */
  respetarVentanas?: boolean;
  velocidadKmH?: number;      // velocidad media urbana puerta a puerta
  minutosPorParada?: number;  // descarga + firma
  horaSalida?: string;        // 'HH:MM' de salida del CD
  /** Radio desde el CD para considerar una tienda parte del pool RM. Fuera de esto va por
   *  el flujo Regiones (Sendu) — hoy se cuelan tiendas de Antofagasta/Castro en despacho_rm. */
  radioRMKm?: number;
  /**
   * Empresa transportista habitual de cada tienda (código → empresa). Cuando hay VARIOS camiones
   * que sirven para un grupo, se prefiere uno de esta empresa.
   *
   * Antes esto era solo un aviso: el motor detectaba la afinidad, asignaba por capacidad y después
   * se quejaba. Medido sobre un día real, los 8 avisos de "suele ir con X" eran evitables — en los
   * 8 casos había un camión activo de la empresa correcta con capacidad de sobra.
   */
  empresaPorTienda?: Record<string, string>;
}

export const OPCIONES_DEFAULT: Required<OpcionesEnrutador> = {
  empresaPorTienda: {},
  maxDiametroKm: 20,
  respetarVentanas: true,
  velocidadKmH: 22,
  minutosPorParada: 12,
  horaSalida: '08:00',
  radioRMKm: 60,
};

/**
 * Toda tienda del pool termina en EXACTAMENTE una de estas listas. Es un invariante verificado en
 * test: `rutas + fueraDeRadio + segundaVuelta + sinFlota` reconstruye el pool completo.
 *
 * Antes solo existía `rutas`, y lo que no entraba se caía con un aviso de texto: en la prueba con
 * 8 tiendas y un camión chico desaparecían 5. Separar los dos motivos importa porque la acción es
 * distinta: `segundaVuelta` se resuelve con otro viaje, `sinFlota` activando un vehículo.
 */
export interface ResultadoEnrutador {
  rutas: Ruta[];
  /** Fuera del radio RM: van por Regiones (Sendu), no por ruta de Santiago. */
  fueraDeRadio: StoreItem[];
  /** No caben hoy en la flota activada. Ustedes ya resuelven esto con 2ª vuelta 35% de los días. */
  segundaVuelta: StoreItem[];
  /** No hay ningún vehículo activo que las pueda llevar. */
  sinFlota: StoreItem[];
  /** Mensajes accionables para el coordinador. */
  avisos: string[];
}

// ── Ventanas horarias ────────────────────────────────────────────────────────────

/** Convierte 'HH:MM' a minutos desde medianoche. Devuelve null si no parsea. */
export function aMinutos(hhmm: string): number | null {
  const m = String(hhmm ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Parsea la ventana de recepción de una tienda. Acepta los formatos que llegan del catálogo:
 * '09:00-12:00', '09:00 - 14:00' y '08:00-09:00 / 20:00-21:00' (se toma la PRIMERA franja: la de
 * la mañana, que es la que aplica al despacho). Sin ventana → null (la tienda no restringe).
 */
export function parseVentana(v?: string | null): { abre: number; cierra: number } | null {
  const m = String(v ?? '').match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!m) return null;
  const abre = aMinutos(m[1]), cierra = aMinutos(m[2]);
  if (abre == null || cierra == null || cierra <= abre) return null;
  return { abre, cierra };
}

// ── Geometría de una secuencia de paradas ────────────────────────────────────────

/** Km del ciclo CD → paradas en orden → CD. Tiendas sin GPS no suman distancia (pero se conservan). */
export function kmRuta(cods: string[], gps: Record<string, number[]>, cd: number[]): number {
  let cur = cd, total = 0, visitó = false;
  for (const c of cods) {
    const g = gps[c];
    if (!g) continue;
    total += dkm(cur, g); cur = g; visitó = true;
  }
  return visitó ? total + dkm(cur, cd) : 0;
}

/** Distancia entre las 2 tiendas más lejanas del grupo — "qué tan estirada" queda la ruta. */
export function diametroKm(cods: string[], gps: Record<string, number[]>): number {
  const pts = cods.map(c => gps[c]).filter(Boolean) as number[][];
  let max = 0;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const d = dkm(pts[i], pts[j]);
      if (d > max) max = d;
    }
  return max;
}

/** Minuto de llegada estimado a cada parada, en orden. */
export function horariosLlegada(
  cods: string[], gps: Record<string, number[]>, cd: number[], o: Required<OpcionesEnrutador>,
): number[] {
  let t = aMinutos(o.horaSalida) ?? 8 * 60;
  let cur = cd;
  return cods.map(c => {
    const g = gps[c];
    if (g) { t += (dkm(cur, g) / o.velocidadKmH) * 60; cur = g; }
    const llegada = t;
    t += o.minutosPorParada;
    return llegada;
  });
}

/** Códigos a los que se llegaría DESPUÉS del cierre de su ventana, en ese orden. */
export function ventanasIncumplidas(
  cods: string[], gps: Record<string, number[]>, cd: number[],
  tiendas: Record<string, TiendaInfo> | undefined, o: Required<OpcionesEnrutador>,
): string[] {
  const t = horariosLlegada(cods, gps, cd, o);
  return cods.filter((c, i) => {
    const v = parseVentana(tiendas?.[c]?.v);
    return v != null && t[i] > v.cierra;
  });
}

// ── Orden de paradas: vecino más cercano + pulido 2-opt ──────────────────────────

/** Orden inicial por vecino más cercano desde el CD. Determinista (empate → menor código). */
export function ordenVecinoCercano(cods: string[], gps: Record<string, number[]>, cd: number[]): string[] {
  const pend = cods.slice().sort();
  const out: string[] = [];
  let cur = cd;
  while (pend.length) {
    let mejor = 0, mejorD = Infinity;
    pend.forEach((c, i) => {
      const g = gps[c];
      const d = g ? dkm(cur, g) : Infinity;
      if (d < mejorD) { mejorD = d; mejor = i; }
    });
    const nx = pend.splice(mejor, 1)[0];
    if (gps[nx]) cur = gps[nx];
    out.push(nx);
  }
  return out;
}

/**
 * Pulido 2-opt: invierte tramos mientras eso acorte el ciclo. Sobre los grupos reales del
 * coordinador recupera ~3.5% de los km que deja el vecino más cercano. `maxPasadas` acota el
 * costo (el pool diario son ~30 tiendas; converge en pocas pasadas).
 */
export function dosOpt(
  cods: string[], gps: Record<string, number[]>, cd: number[], maxPasadas = 40,
): string[] {
  let best = cods.slice();
  let bestKm = kmRuta(best, gps, cd);
  for (let pasada = 0; pasada < maxPasadas; pasada++) {
    let mejoró = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const km = kmRuta(cand, gps, cd);
        if (km < bestKm - 1e-9) { best = cand; bestKm = km; mejoró = true; }
      }
    }
    if (!mejoró) break;
  }
  return best;
}

/**
 * Orden final de las paradas: vecino más cercano + 2-opt.
 *
 * Con 2 paradas el 2-opt no puede mejorar los km (el ciclo invertido mide lo mismo), pero el ORDEN
 * igual importa: cambia la hora de llegada a cada tienda y por lo tanto el cumplimiento de ventana.
 * Por eso se ordena igual — y de paso el resultado deja de depender de cómo venía la cadena.
 */
export function ordenarParadas(cods: string[], gps: Record<string, number[]>, cd: number[]): string[] {
  if (cods.length <= 1) return cods.slice();
  const base = ordenVecinoCercano(cods, gps, cd);
  return base.length <= 2 ? base : dosOpt(base, gps, cd);
}

// ── Núcleo: Clarke-Wright con restricciones ──────────────────────────────────────

interface RutaParcial { cods: string[]; p: number; b: number; ch: number; }

const bultosDe = (s: StoreItem) => s.b + (s.ch ?? 0);

/**
 * Agrupa el pool en rutas por AHORRO: unir i y j ahorra `d(CD,i) + d(CD,j) − d(i,j)`. Se procesan
 * los pares de mayor ahorro primero y se fusionan solo si la ruta resultante sigue siendo
 * operable: cabe en el camión más grande, no se estira más de `maxDiametroKm` y no rompe ninguna
 * ventana. El resultado son grupos geográficamente coherentes, no un relleno por capacidad.
 */
export function agruparPorAhorro(
  pool: StoreItem[],
  capPallets: number,
  gps: Record<string, number[]>,
  cd: number[],
  tiendas: Record<string, TiendaInfo> | undefined,
  o: Required<OpcionesEnrutador>,
): string[][] {
  const conGps = pool.filter(s => gps[s.c]);
  const sinGps = pool.filter(s => !gps[s.c]);

  let rutas: RutaParcial[] = conGps
    .slice()
    .sort((a, b) => a.c.localeCompare(b.c))
    .map(s => ({ cods: [s.c], p: s.p, b: bultosDe(s), ch: s.ch ?? 0 }));

  // Los pares se generan sobre los códigos ORDENADOS y con (menor, mayor): así ni la lista de
  // pares ni la dirección de cada fusión dependen de cómo venía ordenado el pool.
  const codsOrdenados = conGps.map(s => s.c).sort();
  const ahorros: { i: string; j: string; s: number }[] = [];
  for (let x = 0; x < codsOrdenados.length; x++) {
    for (let y = x + 1; y < codsOrdenados.length; y++) {
      const a = codsOrdenados[x], b = codsOrdenados[y];
      ahorros.push({ i: a, j: b, s: dkm(cd, gps[a]) + dkm(cd, gps[b]) - dkm(gps[a], gps[b]) });
    }
  }
  // Determinismo: mismo ahorro → orden alfabético estable.
  ahorros.sort((x, y) => (y.s - x.s) || x.i.localeCompare(y.i) || x.j.localeCompare(y.j));

  for (const { i, j } of ahorros) {
    const ri = rutas.find(r => r.cods.includes(i));
    const rj = rutas.find(r => r.cods.includes(j));
    if (!ri || !rj || ri === rj) continue;
    // Clarke-Wright solo fusiona por los EXTREMOS: mantiene cada ruta como una cadena.
    const iEsExtremo = ri.cods[0] === i || ri.cods[ri.cods.length - 1] === i;
    const jEsExtremo = rj.cods[0] === j || rj.cods[rj.cods.length - 1] === j;
    if (!iEsExtremo || !jEsExtremo) continue;
    // Solo los PALLETS limitan: en la operación real los bultos y chocolates viajan sueltos
    // encima de la carga y nunca son el cuello de botella. Se siguen contando para el manifiesto.
    if (ri.p + rj.p > capPallets) continue;

    const izq = ri.cods[ri.cods.length - 1] === i ? ri.cods : ri.cods.slice().reverse();
    const der = rj.cods[0] === j ? rj.cods : rj.cods.slice().reverse();
    const cand = [...izq, ...der];

    if (o.maxDiametroKm > 0 && diametroKm(cand, gps) > o.maxDiametroKm) continue;
    if (o.respetarVentanas && ventanasIncumplidas(ordenarParadas(cand, gps, cd), gps, cd, tiendas, o).length) continue;

    ri.cods = cand; ri.p += rj.p; ri.b += rj.b; ri.ch += rj.ch;
    rutas = rutas.filter(r => r !== rj);
  }

  const grupos = rutas
    .sort((a, b) => (b.p - a.p) || a.cods[0].localeCompare(b.cods[0]))
    .map(r => ordenarParadas(r.cods, gps, cd));

  // Las tiendas sin GPS no pueden rutearse por geografía: van en su propio grupo al final para
  // que el coordinador las ubique a mano (antes se mezclaban en silencio y ensuciaban la ruta).
  if (sinGps.length) grupos.push(sinGps.map(s => s.c).sort());
  return grupos;
}

// ── Camiones: emparejar grupo → vehículo ─────────────────────────────────────────

/** Un grupo geográfico listo para subir a un camión. */
export interface GrupoCarga { cods: string[]; p: number; ch: number }

/** Empresa que lleva a la mayoría de las tiendas del grupo (empate → nombre menor, determinista). */
export function empresaDelGrupo(cods: string[], empresaPorTienda: Record<string, string>): string | null {
  const cuenta = new Map<string, number>();
  for (const c of cods) {
    const e = (empresaPorTienda[c] ?? '').trim();
    if (e) cuenta.set(e, (cuenta.get(e) ?? 0) + 1);
  }
  if (!cuenta.size) return null;
  return [...cuenta.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))[0][0];
}

/**
 * Elige el mejor camión LIBRE para un grupo, entre los que lo aguantan enteros. Prioridades, en
 * orden: (1) la empresa que suele llevar esas tiendas; (2) refrigerado solo si hay chocolates —
 * y evitarlo si no los hay, porque es escaso; (3) el más chico que quepa, para no gastar un camión
 * grande en una ruta liviana. Devuelve null si NINGUNO lo aguanta entero.
 */
export function mejorCamion(
  grupo: GrupoCarga, libres: Vehiculo[], empresaPorTienda: Record<string, string>,
): Vehiculo | null {
  const caben = libres.filter(v => v.c >= grupo.p);
  if (!caben.length) return null;
  const emp = empresaDelGrupo(grupo.cods, empresaPorTienda);
  const puntaje = (v: Vehiculo): [number, number, number, string] => [
    emp && String(v.empresa ?? '').trim() === emp ? 0 : 1,
    grupo.ch > 0 ? (v.refrigerado ? 0 : 1) : (v.refrigerado ? 1 : 0),
    v.c,
    v.p,
  ];
  return caben.slice().sort((a, b) => {
    const x = puntaje(a), y = puntaje(b);
    return (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]) || x[3].localeCompare(y[3]);
  })[0];
}

/**
 * Empaqueta los grupos en la flota REAL, respetando la capacidad de cada camión.
 *
 * Reemplaza al emparejamiento anterior, que tenía dos salidas de emergencia inseguras: si ningún
 * camión libre aguantaba el grupo, agarraba el más chico que quedara SIN mirar capacidad, o lo
 * volcaba al furgón TLBD de 3 pallets. Medido sobre 49 días reales, eso producía 0,59 camiones
 * sobrecargados por día — el coordinador, en 309 camión-día registrados, no sobrecargó ninguno.
 *
 * Acá, cuando un grupo no entra entero, NO se fuerza ni se descarta: se parte. Se llena el camión
 * más grande disponible con un prefijo del recorrido ya ordenado (para que las tiendas que quedan
 * juntas sigan siendo vecinas) y el resto vuelve a la cola. Lo que no alcanza a subir a ningún
 * camión sale por `sobrante` — que arriba se convierte en 2ª vuelta, no en tiendas perdidas.
 *
 * El furgón TLBD queda como último recurso, pero respetando su capacidad como cualquier otro.
 */
export function empacarEnFlota(
  grupos: GrupoCarga[],
  flota: Vehiculo[],
  palletsDe: (cod: string) => number,
  ordenar: (cods: string[]) => string[],
  empresaPorTienda: Record<string, string> = {},
): { asignaciones: { v: Vehiculo; cods: string[] }[]; sobrante: string[] } {
  const porCap = (a: Vehiculo, b: Vehiculo) => (b.c - a.c) || a.p.localeCompare(b.p);
  const normales = flota.filter(v => v.on && !v.tlbd).slice().sort(porCap);
  const furgones = flota.filter(v => v.on && v.tlbd).slice().sort(porCap);

  const asignaciones: { v: Vehiculo; cods: string[] }[] = [];
  const sobrante: string[] = [];
  const pendientes = grupos.filter(g => g.cods.length).map(g => ({ ...g }));

  const quitar = (v: Vehiculo) => {
    for (const pool of [normales, furgones]) {
      const i = pool.indexOf(v);
      if (i >= 0) { pool.splice(i, 1); return; }
    }
  };
  const rehacer = (cods: string[]): GrupoCarga => ({
    cods, p: cods.reduce((s, c) => s + palletsDe(c), 0), ch: 0,
  });

  let guarda = 0;
  while (pendientes.length && guarda++ < 1000) {
    // Siempre el grupo más pesado primero: los grandes son los que menos opciones tienen.
    // Empate → gana el de menor código, para que el resultado no dependa del orden de entrada.
    const clave = (x: GrupoCarga) => [...x.cods].sort()[0] ?? '';
    let idx = 0;
    for (let i = 1; i < pendientes.length; i++) {
      const a = pendientes[i], b = pendientes[idx];
      if (a.p > b.p || (a.p === b.p && clave(a) < clave(b))) idx = i;
    }
    const g = pendientes.splice(idx, 1)[0];

    const v = mejorCamion(g, normales, empresaPorTienda) ?? mejorCamion(g, furgones, empresaPorTienda);
    if (v) { quitar(v); asignaciones.push({ v, cods: g.cods }); continue; }

    // No entra entero en ningún camión libre → partirlo por el camión más grande que quede.
    const mayor = [...normales, ...furgones].sort(porCap)[0];
    if (!mayor) { sobrante.push(...g.cods); continue; }   // ya no queda flota

    const orden = ordenar(g.cods);
    const suben: string[] = [];
    let acum = 0;
    for (const c of orden) {
      const pc = palletsDe(c);
      if (acum + pc <= mayor.c) { suben.push(c); acum += pc; }
    }
    if (!suben.length) {
      // Una sola tienda pesa más que el camión más grande: no hay forma de subirla hoy.
      sobrante.push(orden[0]);
      const resto = orden.slice(1);
      if (resto.length) pendientes.push(rehacer(resto));
      continue;
    }
    quitar(mayor);
    asignaciones.push({ v: mayor, cods: suben });
    const resto = orden.filter(c => !suben.includes(c));
    if (resto.length) pendientes.push(rehacer(resto));
  }
  for (const g of pendientes) sobrante.push(...g.cods);   // por si se agotó la guarda

  return { asignaciones, sobrante };
}

// ── API principal (drop-in de `asignar`) ─────────────────────────────────────────

/**
 * Propone la asignación del día. Misma forma de salida que `asignar()` (Ruta[]), más el triage de
 * tiendas fuera de radio y los avisos accionables.
 */
export function enrutarV2(
  pool: StoreItem[],
  flota: Vehiculo[],
  gps: Record<string, number[]>,
  cd: number[],
  tiendas?: Record<string, TiendaInfo>,
  opciones: OpcionesEnrutador = {},
): ResultadoEnrutador {
  const o = { ...OPCIONES_DEFAULT, ...opciones };
  const avisos: string[] = [];
  const vacio = (extra: Partial<ResultadoEnrutador> = {}): ResultadoEnrutador =>
    ({ rutas: [], fueraDeRadio: [], segundaVuelta: [], sinFlota: [], avisos, ...extra });

  // El furgón TLBD cuenta como vehículo: empacarEnFlota lo usa de último recurso, respetando su
  // capacidad. Solo si NO hay ninguno activo el día no se puede rutear.
  const activos = flota.filter(v => v.on);
  if (!activos.length) {
    avisos.push('No hay vehículos activos: activá al menos uno para poder rutear.');
    return vacio({ sinFlota: pool.slice() });
  }

  // 1) Triage: lo que está fuera del radio RM no es problema del enrutador de Santiago.
  const dentro: StoreItem[] = [], fueraDeRadio: StoreItem[] = [];
  for (const s of pool) {
    const g = gps[s.c];
    if (o.radioRMKm > 0 && g && dkm(cd, g) > o.radioRMKm) fueraDeRadio.push(s);
    else dentro.push(s);
  }
  if (fueraDeRadio.length)
    avisos.push(`${fueraDeRadio.length} tienda(s) a más de ${o.radioRMKm} km del CD (${fueraDeRadio.map(s => s.c).join(', ')}) — van por Regiones, no por ruta RM.`);

  const sinGps = dentro.filter(s => !gps[s.c]).map(s => s.c);
  if (sinGps.length) avisos.push(`Sin coordenadas: ${sinGps.join(', ')} — quedan agrupadas aparte, ubicalas a mano.`);

  if (!dentro.length) return vacio({ fueraDeRadio });

  const porCodigo = new Map(dentro.map(s => [s.c, s]));

  // 2) Agrupar por ahorro geográfico, acotado por el camión más grande de la flota activa.
  const capMax = Math.max(...activos.map(v => v.c));
  const gruposCods = agruparPorAhorro(dentro, capMax, gps, cd, tiendas, o);
  const grupos: GrupoCarga[] = gruposCods.map(cods => ({
    cods,
    p:  cods.reduce((s, c) => s + (porCodigo.get(c)?.p ?? 0), 0),
    ch: cods.reduce((s, c) => s + (porCodigo.get(c)?.ch ?? 0), 0),
  }));

  // 3) Empaquetar en la flota real: respeta capacidad, parte lo que no entra, no descarta nada.
  const { asignaciones, sobrante } = empacarEnFlota(
    grupos, flota,
    c => porCodigo.get(c)?.p ?? 0,
    cods => ordenarParadas(cods, gps, cd),
    o.empresaPorTienda,
  );

  const rutas: Ruta[] = asignaciones.map(({ v, cods }) => {
    const orden = ordenarParadas(cods, gps, cd);
    const ts = orden.map(c => ({ ...porCodigo.get(c)!, _v: tiendas?.[c]?.v ?? '' }));
    return {
      v, ts,
      tp: ts.reduce((s, t) => s + t.p, 0),
      tb: ts.reduce((s, t) => s + bultosDe(t), 0),
    };
  }).filter(r => r.ts.length);

  const segundaVuelta = sobrante.map(c => porCodigo.get(c)).filter((s): s is StoreItem => !!s);
  if (segundaVuelta.length)
    avisos.push(`${segundaVuelta.length} tienda(s) no caben en la flota de hoy (${segundaVuelta.map(s => s.c).join(', ')}) — van a 2ª vuelta o activá otro camión.`);

  // 4) Avisos de ventana y de transportista sobre la propuesta final.
  for (const r of rutas) {
    const tarde = ventanasIncumplidas(r.ts.map(t => t.c), gps, cd, tiendas, o);
    if (tarde.length) avisos.push(`${r.v.p}: se llegaría fuera de ventana a ${tarde.join(', ')}.`);
    // La empresa ya se prefirió al empaquetar; si igual no se pudo, ES informativo de verdad.
    const emp = String(r.v.empresa ?? '').trim();
    const distintas = [...new Set(r.ts.map(t => (o.empresaPorTienda[t.c] ?? '').trim())
      .filter(e => e && emp && e !== emp))];
    if (distintas.length)
      avisos.push(`${r.v.p} (${emp}) lleva tiendas de ${distintas.join(', ')} — no había camión libre de esa empresa.`);
  }

  return { rutas, fueraDeRadio, segundaVuelta, sinFlota: [], avisos };
}
