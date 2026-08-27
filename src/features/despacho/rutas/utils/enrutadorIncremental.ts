// [E5] ENRUTADOR INCREMENTAL — arma las rutas A MEDIDA que sale la mercadería, en vez de esperar
// a que el día esté completo y que alguien las dibuje a mano.
//
// QUÉ HABILITA ESTO (medido sobre picking_pallets: 5.127 unidades activas, 60 días):
//
//   · La mercadería sale entre las 09:00 y las 18:00, con el pico entre 11:00 y 13:00. A las 12:00
//     recién salió el 43% del día; a las 14:00 el 75%; a las 16:00 el 96%. Esperar a tener todo
//     significa empezar a rutear a media tarde.
//   · Una tienda no sale de una vez: entre su primera y su última unidad pasan 90 min (mediana);
//     solo el 19% se completa en menos de 30 min.
//   · Por eso NO sirve "cerrar cuando la tienda lleva un rato en silencio": cerrando tras 30 min
//     sin novedad uno se equivoca el 35% de las veces; incluso tras 2 horas, el 12%.
//
// LA SALIDA A ESO es no esperar el silencio sino COMPARAR CONTRA LO ESPERADO: cada tienda tiene un
// volumen histórico por día de semana (CV mediana 0.41 separando por día). Con eso el enrutador
// RESERVA la capacidad de lo que todavía no salió y puede comprometer un camión temprano sin
// arrepentirse después.
//
// Y UNA REGLA FÍSICA que la planilla RUTA SUR documenta y el sistema hoy ignora: la carga es LIFO
// — la última entrega se carga primero (al fondo) y la primera queda en la puerta. Por eso importa
// decidir el ORDEN antes de cargar: una tienda que se suma tarde a un camión ya cargado solo puede
// entrar cerca de la puerta, o sea al principio del recorrido.
//
// Puro y testeable: sin red, sin estado, sin reloj propio (`ahora` se inyecta).

import type { StoreItem, Ruta } from './routing';
import type { Vehiculo } from '../data/flota';
import type { TiendaInfo } from '../data/tiendas';
import { enrutarV2, type OpcionesEnrutador, ordenarParadas } from './enrutadorV2';

/** Los cuatro tipos de bulto que maneja el CD. */
export type TipoCarga = 'P' | 'B' | 'C' | 'CH';

/** Una unidad tal como la registra bodega al salir (fila de `picking_pallets`). */
export interface UnidadSalida {
  cod: string;          // código de tienda
  tipo: TipoCarga;
  minuto: number;       // minutos desde medianoche en que se registró
}

/** Lo que la historia dice que una tienda pide un día como hoy. */
export interface EsperadoTienda {
  /** unidades TOTALES esperadas (pallets + bultos + chocolates + contenedores). Sirve para saber
   *  si la tienda ya está completa: una tienda con los pallets listos pero los chocolates
   *  pendientes todavía no se puede cargar. */
  esperado: number;
  /** PALLETS a reservar en el camión. Solo los pallets ocupan capacidad; los bultos y chocolates
   *  viajan encima y nunca son el límite. */
  techoPallets: number;
  /** empresa transportista que la lleva habitualmente, y con qué fuerza */
  empresa?: string;
  confianzaEmpresa?: number;   // 0..1
  /** true si la tienda todavía no tiene historial (recién agregada). Cambia cómo se la trata:
   *  no se puede saber cuánta carga falta, así que no se cierra temprano por las dudas. */
  sinHistorial?: boolean;
}

export type EstadoTienda = 'esperando' | 'probable' | 'completa';

export interface CamionPlan {
  v: Vehiculo;
  ts: StoreItem[];             // carga YA salida, en orden de entrega
  orden: string[];             // orden de ENTREGA
  ordenCarga: string[];        // orden de CARGA (inverso: fondo → puerta)
  tp: number; tb: number;
  reservado: number;           // pallets que todavía no salen pero están comprometidos
  estado: 'abierto' | 'listo' | 'cerrar-ya';
  motivo: string;
}

export interface PlanIncremental {
  camiones: CamionPlan[];
  /** tiendas del día que todavía no tienen historial (recién agregadas al catálogo) */
  nuevas?: string[];
  /** tiendas que ya asomaron pero todavía no entran en ningún camión */
  enEspera: { cod: string; recibido: number; esperado: number; estado: EstadoTienda }[];
  avisos: string[];
}

export interface OpcionesIncremental extends OpcionesEnrutador {
  /** Hora (minutos) a partir de la cual se cierra igual, haya salido todo o no. */
  corteCierre?: number;
  /** Minutos sin novedad tras los cuales una tienda que ya alcanzó lo esperado se da por cerrada. */
  silencioMin?: number;
  /** Si la confianza histórica supera esto, la empresa transportista se respeta como restricción. */
  umbralEmpresa?: number;
}

export const INCREMENTAL_DEFAULT: Required<Pick<OpcionesIncremental, 'corteCierre' | 'silencioMin' | 'umbralEmpresa'>> = {
  corteCierre: 15 * 60,   // 15:00 — a esa hora ya salió el 86% del día
  silencioMin: 90,        // medido: 45 min → 72% de cierres correctos · 90 min → 79%
  umbralEmpresa: 0.6,
};

// ── Historial: qué espera cada tienda y quién la lleva ───────────────────────────

function limpios(porDia: number[]): number[] {
  return porDia.filter(n => Number.isFinite(n) && n >= 0);
}

export function mediana(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Volumen esperado de una tienda para un día de semana. `unidadesPorDia` son los totales diarios
 * observados (todos los tipos) y `palletsPorDia` solo los pallets — conviene separar por día de
 * semana, porque hacerlo baja la variabilidad de 0.53 a 0.41 en la mediana de las tiendas.
 *
 * `esperado` usa la MEDIANA, no el promedio. La distribución tiene cola larga (unos pocos días
 * enormes), así que el promedio queda por encima de lo que pasa la mayoría de los días: medido
 * sobre 500 tienda-día, el real quedó DEBAJO del promedio el 63% de las veces, y con ese umbral la
 * tienda casi nunca se daba por completa. Cambiar a mediana sube la precisión del cierre de 71% a
 * 79% y casi duplica las tiendas que se pueden liberar temprano.
 *
 * `techoPallets` sí usa promedio + 1 desviación, porque ahí el error caro es el contrario:
 * reservar de menos obliga a rehacer el camión.
 */
export function esperadoDesdeHistorial(
  unidadesPorDia: number[],
  palletsPorDia: number[] = unidadesPorDia,
  palletsPorDefecto = 2,
): { esperado: number; techoPallets: number; sinHistorial: boolean } {
  const u = limpios(unidadesPorDia);
  const p = limpios(palletsPorDia);
  // Tienda recién agregada: no hay con qué estimar. Se reserva un default en vez de 1 pallet (que
  // dejaría el camión corto el primer día) y se marca para no cerrarla antes de tiempo.
  if (!p.length) return { esperado: mediana(u), techoPallets: palletsPorDefecto, sinHistorial: true };
  const media = p.reduce((s, n) => s + n, 0) / p.length;
  const sd = Math.sqrt(p.reduce((s, n) => s + (n - media) ** 2, 0) / p.length);
  return {
    esperado: mediana(u),
    techoPallets: Math.max(Math.ceil(media + sd), Math.round(media) + 1),
    sinHistorial: false,
  };
}

/** Un despacho pasado: qué empresa lo llevó y hace cuántos días fue. */
export interface DespachoPasado { empresa: string; diasAtras: number; }

/**
 * Transportista habitual de una tienda, PONDERANDO LO RECIENTE.
 *
 * Dos cosas que dice la data y que hay que respetar juntas:
 *   1. La fidelidad no es al camión sino a la EMPRESA. Por patente la concentración mediana es 42%
 *      (ruido puro: en RM una tienda usa 7 a 9 camiones distintos); por empresa, 80%. Fijar patente
 *      sería aprender ruido; fijar empresa es una regla real.
 *   2. La operación CAMBIÓ de manos durante el historial: Falabella pasó de 2% a 0.4%, Kios Club
 *      apareció recién en julio y ya va en 19%, y 19 de 57 tiendas cambiaron de empresa dominante.
 *      Contar los 60 días por igual haría que el enrutador siguiera proponiendo al transportista
 *      anterior. Por eso cada despacho pesa la mitad cada `semividaDias`, y lo reciente manda.
 *
 * Con ventana reciente la concentración mediana sube de 80% a 87%.
 */
export function empresaHabitual(
  historial: DespachoPasado[],
  semividaDias = 21,
): { empresa: string; confianza: number } | null {
  // Se descartan las entradas con `diasAtras` no finito. Sin este filtro, una sola fecha mal
  // parseada envenenaba TODO el cálculo: el peso salía NaN, la empresa quedaba al azar y la
  // confianza NaN — que además burla el umbral, porque `NaN < 0.6` es false y el aviso se emitía
  // igual mostrando "NaN%". Pasó de verdad con las fechas DD/MM/YYYY de despacho_rm.
  const v = historial.filter(d => String(d?.empresa ?? '').trim() && Number.isFinite(d?.diasAtras));
  if (!v.length) return null;
  const peso = new Map<string, number>();
  let total = 0;
  for (const d of v) {
    const w = Math.pow(0.5, Math.max(0, d.diasAtras) / semividaDias);
    const e = d.empresa.trim();
    peso.set(e, (peso.get(e) ?? 0) + w);
    total += w;
  }
  // Empate → gana el nombre menor, para que el resultado no dependa del orden de entrada.
  const [empresa, w] = [...peso.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))[0];
  return { empresa, confianza: total ? w / total : 0 };
}

// ── Estado de una tienda en el día en curso ──────────────────────────────────────

/** Suma las unidades ya salidas de una tienda, separadas por tipo. */
export function acumular(unidades: UnidadSalida[]): Record<string, StoreItem & { c_: number; ultimo: number }> {
  const out: Record<string, StoreItem & { c_: number; ultimo: number }> = {};
  for (const u of unidades) {
    const it = (out[u.cod] ??= { c: u.cod, p: 0, b: 0, ch: 0, c_: 0, ultimo: -1 });
    if (u.tipo === 'P') it.p++;
    else if (u.tipo === 'B') it.b++;
    else if (u.tipo === 'CH') it.ch = (it.ch ?? 0) + 1;
    else if (u.tipo === 'C') it.c_++;
    if (u.minuto > it.ultimo) it.ultimo = u.minuto;
  }
  return out;
}

/**
 * ¿Se puede dar por cerrada una tienda?
 *   completa  → ya salió lo esperado (o pasó el corte): se puede cargar y salir.
 *   probable  → alcanzó lo esperado hace poco; falta que se enfríe el silencio.
 *   esperando → todavía falta carga; hay que reservarle espacio, no cerrarla.
 */
export function estadoTienda(
  recibido: number, esperado: number, ultimoMin: number, ahora: number,
  o: Required<Pick<OpcionesIncremental,'corteCierre'|'silencioMin'|'umbralEmpresa'>>,
  sinHistorial = false,
): EstadoTienda {
  if (ahora >= o.corteCierre) return 'completa';
  if (recibido === 0) return 'esperando';
  // Sin historial no hay forma de saber cuánto falta: `esperado` valdría 0 y la tienda se daría por
  // completa apenas llegue su primera unidad. Se espera hasta el corte y recién ahí se cierra.
  if (sinHistorial) return 'esperando';
  if (recibido < esperado) return 'esperando';
  return (ahora - ultimoMin >= o.silencioMin) ? 'completa' : 'probable';
}

// ── Carga LIFO ───────────────────────────────────────────────────────────────────

/**
 * Orden de CARGA a partir del orden de ENTREGA. El camión se carga por la puerta, así que lo
 * último que se entrega tiene que entrar primero (queda al fondo) y lo primero que se entrega
 * queda a mano. Es literalmente la lista de entrega al revés — la regla que la hoja RUTA SUR
 * describe a mano para la ruta al sur y que aplica a todos los camiones con plataforma.
 */
export function ordenDeCarga(ordenEntrega: string[]): string[] {
  return ordenEntrega.slice().reverse();
}

/**
 * ¿Dónde puede entrar una tienda que aparece TARDE en un camión ya cargado? Solo cerca de la
 * puerta, o sea al principio del recorrido: meterla al medio obligaría a descargar todo.
 * Devuelve la posición máxima (0-based) que puede ocupar en el orden de entrega.
 */
export function posicionMaximaTardia(paradasYaCargadas: number): number {
  return paradasYaCargadas === 0 ? Number.MAX_SAFE_INTEGER : 0;
}

// ── Planificación incremental ────────────────────────────────────────────────────

/**
 * Arma el plan del día con lo que salió HASTA AHORA, reservando capacidad para lo que la historia
 * dice que todavía falta.
 *
 * La idea central: una tienda entra al ruteo apenas asoma su primera unidad, pero ocupa en el
 * camión el espacio de su TECHO histórico, no el de lo que lleva salido. Así el camión no se
 * "llena" con carga a medio salir y después hay que rehacer todo. Cuando todas las tiendas de un
 * camión están completas, ese camión se puede cerrar y cargar sin esperar al resto del día.
 */
export function planificarIncremental(
  unidades: UnidadSalida[],
  flota: Vehiculo[],
  gps: Record<string, number[]>,
  cd: number[],
  tiendas: Record<string, TiendaInfo> | undefined,
  historial: Record<string, EsperadoTienda>,
  ahora: number,
  opciones: OpcionesIncremental = {},
): PlanIncremental {
  const o = { ...INCREMENTAL_DEFAULT, ...opciones };
  const avisos: string[] = [];
  const acc = acumular(unidades);
  const cods = Object.keys(acc).sort();

  if (!cods.length) return { camiones: [], enEspera: [], avisos: ['Todavía no sale mercadería.'] };

  // 1) Estado de cada tienda y carga a RESERVAR (lo salido, o el techo si aún falta).
  const estados: Record<string, EstadoTienda> = {};
  const paraRutear: StoreItem[] = [];
  for (const cod of cods) {
    const it = acc[cod];
    const recibido = it.p + it.b + (it.ch ?? 0) + it.c_;
    // Los contenedores ocupan piso igual que un pallet — hoy el enrutador los pierde por completo.
    const pallets = it.p + it.c_;
    // Una tienda que no está en el historial es una tienda NUEVA: se la trata como tal.
    const h = historial[cod] ?? { esperado: 0, techoPallets: Math.max(pallets, 2), sinHistorial: true };
    const est = estadoTienda(recibido, h.esperado, it.ultimo, ahora, o, h.sinHistorial);
    estados[cod] = est;
    // Mientras falte carga se reserva el techo histórico de PALLETS; ya completa, solo lo salido.
    const p = est === 'esperando' ? Math.max(pallets, h.techoPallets) : pallets;
    paraRutear.push({ c: cod, p, b: it.b, ch: it.ch ?? 0 });
  }

  // 2) Geografía + ventanas: el mismo motor v2, sobre el pool parcial con reservas. Se le pasa la
  //    empresa habitual de cada tienda para que la PREFIERA al elegir camión — antes el motor la
  //    detectaba, asignaba por capacidad y después avisaba que no se cumplió (11 avisos por día,
  //    88% de ese tipo, y los 8 revisados eran evitables: había camión de la empresa correcta).
  const empresaPorTienda: Record<string, string> = {};
  for (const [cod, h] of Object.entries(historial)) {
    if (h.empresa && (h.confianzaEmpresa ?? 0) >= o.umbralEmpresa) empresaPorTienda[cod] = h.empresa;
  }
  const base = enrutarV2(paraRutear, flota, gps, cd, tiendas, { ...opciones, empresaPorTienda });
  avisos.push(...base.avisos);

  // 4) ¿Qué camión se puede cerrar ya?
  const camiones: CamionPlan[] = base.rutas.map(r => {
    const orden = r.ts.map(t => t.c);
    const suEstado = orden.map(c => estados[c]);
    const faltan = orden.filter(c => estados[c] === 'esperando');
    const reservado = r.ts.reduce((s, t) => s + Math.max(0, t.p - ((acc[t.c]?.p ?? 0) + (acc[t.c]?.c_ ?? 0))), 0);

    let estado: CamionPlan['estado'] = 'abierto';
    let motivo = '';
    if (ahora >= o.corteCierre) { estado = 'cerrar-ya'; motivo = 'Pasó la hora de corte: se cierra con lo que haya.'; }
    else if (suEstado.every(e => e === 'completa')) { estado = 'listo'; motivo = 'Todas sus tiendas completas: se puede cargar y salir.'; }
    else if (faltan.length) { estado = 'abierto'; motivo = `Falta carga de ${faltan.join(', ')}.`; }
    else { estado = 'abierto'; motivo = 'Carga completa hace poco; se confirma en unos minutos.'; }

    // Solo se listan las unidades REALMENTE salidas (la reserva no se carga).
    const ts = orden.map(c => ({ c, p: (acc[c]?.p ?? 0) + (acc[c]?.c_ ?? 0), b: acc[c]?.b ?? 0, ch: acc[c]?.ch ?? 0 }));
    return {
      v: r.v, ts, orden, ordenCarga: ordenDeCarga(orden),
      tp: ts.reduce((s, t) => s + t.p, 0), tb: ts.reduce((s, t) => s + t.b + (t.ch ?? 0), 0),
      reservado, estado, motivo,
    };
  });

  const enEspera = cods
    .filter(c => !camiones.some(k => k.orden.includes(c)))
    .map(c => ({ cod: c, recibido: acc[c].p + acc[c].b + (acc[c].ch ?? 0) + acc[c].c_,
                 esperado: historial[c]?.esperado ?? 0, estado: estados[c] }));

  const nuevas = cods.filter(c => (historial[c] ?? { sinHistorial: true }).sinHistorial);
  if (nuevas.length)
    avisos.push(`Tienda${nuevas.length === 1 ? '' : 's'} sin historial: ${nuevas.join(', ')}. Se rutea${nuevas.length === 1 ? '' : 'n'} por ubicación, pero no se cierra${nuevas.length === 1 ? '' : 'n'} antes del corte porque no se sabe cuánta carga falta.`);

  const listos = camiones.filter(k => k.estado !== 'abierto').length;
  if (listos) avisos.unshift(listos === 1 ? '1 camión se puede cargar y despachar ya.' : `${listos} camiones se pueden cargar y despachar ya.`);

  return { camiones, enEspera, avisos, nuevas };
}

/**
 * Qué debería terminar bodega AHORA para liberar el próximo camión.
 *
 * Es la vuelta de tuerca que hace que el ruteo incremental sirva de verdad. La medición dice que
 * esperando pasivamente solo se puede cerrar temprano ~1 de cada 3 tiendas: la mercadería de una
 * tienda sale a lo largo de 90 minutos y el historial predice el volumen apenas a medias. Pero el
 * enrutador sabe ANTES que nadie qué tiendas comparten camión — así que en vez de esperar a que
 * bodega termine en el orden que quiera, le puede decir cuáles conviene cerrar primero.
 *
 * Devuelve las tiendas que faltan, ordenadas por cuán cerca está su camión de poder salir: primero
 * las del camión al que le falta menos. Terminar esas libera un camión entero.
 */
export function prioridadPicking(plan: PlanIncremental): { cod: string; patente: string; faltanEnEseCamion: number }[] {
  const out: { cod: string; patente: string; faltanEnEseCamion: number }[] = [];
  for (const k of plan.camiones) {
    if (k.estado !== 'abierto') continue;
    const faltan = k.orden.filter(c => k.motivo.includes(c));
    for (const cod of faltan) out.push({ cod, patente: k.v.p, faltanEnEseCamion: faltan.length });
  }
  return out.sort((a, b) => (a.faltanEnEseCamion - b.faltanEnEseCamion) || a.patente.localeCompare(b.patente) || a.cod.localeCompare(b.cod));
}

/** Convierte el plan a `Ruta[]`, el tipo que ya consumen el mapa, el manifiesto y las tarjetas. */
export function rutasDelPlan(plan: PlanIncremental, gps: Record<string, number[]>, cd: number[]): Ruta[] {
  return plan.camiones.map(k => ({
    v: k.v,
    ts: ordenarParadas(k.orden, gps, cd).map(c => k.ts.find(t => t.c === c)!).filter(Boolean),
    tp: k.tp, tb: k.tb,
  }));
}
