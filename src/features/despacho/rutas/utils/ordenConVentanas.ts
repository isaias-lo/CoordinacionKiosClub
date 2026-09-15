// Ordenar las paradas respetando las ventanas horarias. Puro y testeable.
//
// El orden lo decidía `dosOpt`, que minimiza `kmRuta` — SOLO kilómetros. Las ventanas existían,
// pero se usaban para otras dos cosas: rechazar fusiones (qué tiendas comparten camión) y calcular
// la ETA esperando la apertura. Nunca para decidir el orden.
//
// Por eso un mall con ventana 08:30–09:30 que queda lejos terminaba de séptima parada a las 15:07:
// para el algoritmo, "lejos" era lo único que contaba.
//
// Acá se cambia la MÉTRICA, no el algoritmo. El mismo 2-opt de siempre, con otro costo:
//
//     antes:    minimizar  km
//     ahora:    minimizar  (incumplimientos duros, minutos tarde, km) en ese orden
//
// Es lo que el Handoff marca como portable del Colab, sin traer OR-Tools.

import { kmRuta } from './enrutadorV2';
import {
  parseVentana, cierreEfectivo, durezaPorFormato, BUFFER_CIERRE_MIN,
  type DurezaVentana,
} from './ventanaHoraria';

/** Lo que hace falta saber de una tienda para ordenar. */
export interface TiendaParaOrden {
  /** Ventana del catálogo, "HH:MM-HH:MM". */
  v?: string | null;
  /** Formato (MALL / STRIPCENTER / …). Decide la dureza por defecto. */
  tipo?: string | null;
  /** Dureza explícita, si algún día se configura por tienda. Gana sobre el formato. */
  dureza?: DurezaVentana;
}

export interface OpcionesOrden {
  /** Minutos del día en que sale el camión del CD. */
  salidaMin: number;
  /** Atención por parada. Lo fija el coordinador y puede cambiar cada día. */
  servicioMin: number;
  /** Velocidad para estimar el manejo entre paradas. */
  velocidadKmH: number;
  /** Colchón que se le resta al cierre al OPTIMIZAR (se valida contra el cierre real). */
  bufferMin?: number;
  /** Pasadas máximas del 2-opt. */
  maxPasadas?: number;
}

/**
 * El costo de un orden. Se compara por campos, en este orden de prioridad:
 *
 *   1. `durasIncumplidas` — un mall fuera de ventana es lo más caro que hay.
 *   2. `minutosTardeDuras` — cuando el día NO cabe y todos los órdenes incumplen, se prefiere el
 *      que llegue MENOS tarde. Sin esto, un día imposible dejaría el orden indefinido.
 *   3. `minutosTardeBlandas` — los strips molestan, pero se reciben.
 *   4. `km` — el desempate de siempre.
 */
export interface CostoOrden {
  durasIncumplidas: number;
  minutosTardeDuras: number;
  minutosTardeBlandas: number;
  km: number;
}

/** <0 si `a` es mejor que `b`. */
export function compararCosto(a: CostoOrden, b: CostoOrden): number {
  return (a.durasIncumplidas    - b.durasIncumplidas)
      || (a.minutosTardeDuras   - b.minutosTardeDuras)
      || (a.minutosTardeBlandas - b.minutosTardeBlandas)
      || (a.km                  - b.km);
}

const R = 6371;
const rad = (x: number) => (x * Math.PI) / 180;
/** Distancia en km entre dos coordenadas. */
function dkm(a: number[], b: number[]): number {
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Horas de LLEGADA a cada parada, en minutos del día.
 *
 * El camión ESPERA a que la tienda abra: la atención se cuenta desde que empieza la descarga, no
 * desde que se llega. Esperar en la puerta no descarga nada, y contarlo como si sí dejaba todas
 * las ETAs siguientes optimistas.
 */
export function llegadas(
  cods: string[], gps: Record<string, number[]>, cd: number[],
  tiendas: Record<string, TiendaParaOrden | undefined>, o: OpcionesOrden,
): number[] {
  const out: number[] = [];
  let t = o.salidaMin;
  let pos = cd;
  for (const c of cods) {
    const g = gps[c];
    if (g) { t += (dkm(pos, g) / Math.max(1, o.velocidadKmH)) * 60; pos = g; }
    const llegada = Math.round(t);
    out.push(llegada);
    const w = parseVentana(tiendas[c]?.v);
    const inicio = w && llegada < w.abre ? w.abre : llegada;   // espera a que abran
    t = inicio + o.servicioMin;
  }
  return out;
}

/** Costo de un orden concreto. */
export function costoDeOrden(
  cods: string[], gps: Record<string, number[]>, cd: number[],
  tiendas: Record<string, TiendaParaOrden | undefined>, o: OpcionesOrden,
): CostoOrden {
  const buffer = o.bufferMin ?? BUFFER_CIERRE_MIN;
  const etas = llegadas(cods, gps, cd, tiendas, o);
  let durasIncumplidas = 0, minutosTardeDuras = 0, minutosTardeBlandas = 0;

  cods.forEach((c, i) => {
    const t = tiendas[c];
    const w = parseVentana(t?.v);
    if (!w) return;                                   // sin ventana no restringe
    // Se OPTIMIZA contra el cierre con colchón; la validación que se muestra usa el cierre real.
    const tarde = etas[i] - cierreEfectivo(w, buffer);
    if (tarde <= 0) return;
    const dura = (t?.dureza ?? durezaPorFormato(t?.tipo)) === 'dura';
    if (dura) { durasIncumplidas++; minutosTardeDuras += tarde; }
    else      { minutosTardeBlandas += tarde; }
  });

  return { durasIncumplidas, minutosTardeDuras, minutosTardeBlandas, km: kmRuta(cods, gps, cd) };
}

/** Semilla: vecino más cercano desde el CD. Mismo criterio que usaba el orden por cercanía. */
function vecinoMasCercano(cods: string[], gps: Record<string, number[]>, cd: number[]): string[] {
  const quedan = cods.slice();
  const out: string[] = [];
  let pos = cd;
  while (quedan.length) {
    let mejor = 0, mejorD = Infinity;
    quedan.forEach((c, i) => {
      const g = gps[c];
      const d = g ? dkm(pos, g) : Infinity;
      if (d < mejorD) { mejorD = d; mejor = i; }
    });
    const [c] = quedan.splice(mejor, 1);
    out.push(c);
    if (gps[c]) pos = gps[c];
  }
  return out;
}

/**
 * El orden de visita que mejor cumple las ventanas.
 *
 * Semilla por cercanía + 2-opt, igual que antes — lo único distinto es que el 2-opt acepta un
 * intercambio cuando `compararCosto` dice que mejora, en vez de cuando baja los km.
 *
 * Las paradas SIN coordenada se conservan en su lugar relativo: no se pueden ubicar, pero sacarlas
 * de la ruta sería peor que dejarlas donde el coordinador las puso.
 */
export function ordenarConVentanas(
  cods: string[], gps: Record<string, number[]>, cd: number[],
  tiendas: Record<string, TiendaParaOrden | undefined>, o: OpcionesOrden,
): string[] {
  if (cods.length <= 1) return cods.slice();

  let best = vecinoMasCercano(cods, gps, cd);
  if (best.length === 2) return best;

  let bestCosto = costoDeOrden(best, gps, cd, tiendas, o);
  const maxPasadas = o.maxPasadas ?? 40;

  for (let pasada = 0; pasada < maxPasadas; pasada++) {
    let mejoró = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const costo = costoDeOrden(cand, gps, cd, tiendas, o);
        if (compararCosto(costo, bestCosto) < 0) { best = cand; bestCosto = costo; mejoró = true; }
      }
    }
    if (!mejoró) break;
  }
  return best;
}
