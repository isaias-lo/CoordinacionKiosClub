// El bloque de CRUCE DE PESOS que va dentro de la tarjeta de una tienda, en Bodega. Puro.
//
// ── QUÉ RESPONDE ───────────────────────────────────────────────────────────────────────────────
//
// La hoja CRUCE PESOS contesta la misma pregunta, pero al día siguiente y para todas las tiendas
// juntas. Esto la contesta DONDE SE TRABAJA y MIENTRAS se trabaja: si falta carga por registrar,
// la persona todavía está parada al lado del pallet.
//
// ── NO LE PEGA A ODOO ──────────────────────────────────────────────────────────────────────────
//
// Los movimientos salen de la consulta diaria que la app YA hace para armar Picking
// (`cruce_pesos_dia` reusa `getDayPickings`, que está cacheada). Abrir una tarjeta, o abrir veinte,
// no le cuesta a Odoo ni una llamada más.
//
// ── EL UMBRAL, MEDIDO ──────────────────────────────────────────────────────────────────────────
//
// Sobre las 58 filas reales de la hoja (28 y 29/09/2026):
//
//     mediana |% dif|   10,4        p75   23,4        p90   43,3        máx   75,0
//
// Un umbral en la mediana pintaría de rojo la mitad de las tarjetas TODOS LOS DÍAS. Es exactamente
// la trampa que `manualPesaje.ts` ya documenta para los pallets altos: «avisaría de la mitad de las
// tiendas todos los días y se volvería ruido que la gente aprende a ignorar».
//
// Por eso hacen falta LAS DOS CONDICIONES. Un −40% sobre una tienda de 50 kg son 20 kg y no le
// importa a nadie; un −5% sobre una de 1.500 son 75 kg y sí. El porcentaje dice si la diferencia es
// rara; los kilos dicen si pesa.
//
//     |%| > 25  Y  |kg| > 150   →   13 de 58, unas 6 por día
//
// Y las 13 son huecos de verdad: −772, −720, −572 kg. Ninguna es un redondeo.
//
// ── UN SESGO QUE HAY QUE SABER ─────────────────────────────────────────────────────────────────
//
// Bodega pesa MENOS que Odoo en 47 de 58 casos. No es ruido alrededor de cero: es sistemático. Por
// eso el estado se llama `revisar` y no `error` — una diferencia grande dice «acá hay algo que
// mirar», no «alguien se equivocó». Mientras no se sepa de dónde sale ese sesgo, acusar sería
// adivinar.

import { esSinPesar } from './sinPesar';
import { pctDiferencia, kgDiferencia, TIPOS_CRUCE, type FilaCruce, type TipoCruce } from './cruceDePesos';

/** Por encima de ESTOS DOS a la vez, la tienda se marca para revisar. Ver el encabezado. */
export const TOLERANCIA_PCT = 25;
export const TOLERANCIA_KG  = 150;

export type EstadoCruce = 'sin-pesar' | 'cuadra' | 'revisar';

/** Solo los administradores ven el cruce: compara el andén contra Odoo, no es dato de operación. */
export function veElCruce(rol?: string | null): boolean {
  return String(rol ?? '').trim().toLowerCase() === 'admin';
}

/**
 * En qué estado está la tienda.
 *
 * `sin-pesar` cuando Bodega todavía no pesó NADA. No es «cero kilos»: mostrar un 0 —y su −100%—
 * diría que no llegó nada, que es otra afirmación y más grave. Es la misma regla que la hoja.
 */
export function estadoCruce(kgBodega: number | null, kgOdoo: number): EstadoCruce {
  if (kgBodega === null || !Number.isFinite(kgBodega) || kgBodega <= 0) return 'sin-pesar';
  const pct = pctDiferencia(kgBodega, kgOdoo);
  const kg  = kgDiferencia(kgBodega, kgOdoo);
  if (pct === null) return 'cuadra';   // Odoo en cero: no hay contra qué comparar un porcentaje
  return Math.abs(pct) > TOLERANCIA_PCT && Math.abs(kg) > TOLERANCIA_KG ? 'revisar' : 'cuadra';
}

export interface MovimientoDeTienda {
  tipo: TipoCruce;
  refs: string[];
  kg: number;
}

export interface BloqueCruce {
  estado: EstadoCruce;
  /** `null` mientras no se pesó nada — la tarjeta muestra «— kg», no un cero. */
  kgBodega: number | null;
  kgOdoo: number;
  kgDif: number | null;
  pctDif: number | null;
  /** «3 unidades pesadas de 5». Cuenta unidades, no kilos: es lo que se ve en el andén. */
  pesadas: number;
  unidades: number;
  /** Una línea por tipo de movimiento, con su referencia completa y sus kilos. */
  movimientos: MovimientoDeTienda[];
}

/**
 * Dos decimales, LOS MISMOS que la hoja CRUCE PESOS.
 *
 * No es un detalle: la tarjeta y la hoja contestan la misma pregunta, y si redondearan distinto
 * mostrarían números distintos para el mismo día. Alguien lo notaría y no sabría a cuál creerle.
 * Sin `toFixed`: eso devuelve texto y dejaría de poder sumarse.
 */
const r1 = (n: number) => Math.round(n * 100) / 100;

/**
 * El bloque listo para dibujar.
 *
 * `cruce` es la fila que ya produce `armarCruce` para esta tienda —con sus referencias y kilos por
 * tipo— y `items` son las unidades que Bodega tiene cargadas. No se recalcula nada del lado de
 * Odoo: si se hiciera acá también, dos copias podrían dar distinto y nadie lo notaría.
 */
export function armarBloqueCruce(
  cruce: FilaCruce | null | undefined,
  items: { peso?: number | null; tipo?: string | null; pkg?: string | null }[],
): BloqueCruce {
  const unidades = items.length;
  const pesadas  = items.filter(i => !esSinPesar(i)).length;
  const suma     = items.reduce((s, i) => s + (Number(i.peso) || 0), 0);
  const kgBodega = suma > 0 ? r1(suma) : null;
  const kgOdoo   = r1(cruce?.totalOdoo ?? 0);

  const movimientos: MovimientoDeTienda[] = [];
  for (const t of TIPOS_CRUCE) {
    const refs = cruce?.refs?.[t] ?? [];
    const kg   = cruce?.kg?.[t] ?? 0;
    // Un tipo sin movimientos no ocupa línea: la tarjeta es chica y una fila en cero no dice nada.
    if (!refs.length && kg <= 0) continue;
    movimientos.push({ tipo: t, refs, kg: r1(kg) });
  }

  const estado = estadoCruce(kgBodega, kgOdoo);
  return {
    estado, kgBodega, kgOdoo,
    kgDif:  kgBodega === null ? null : r1(kgDiferencia(kgBodega, kgOdoo)),
    pctDif: kgBodega === null ? null : (() => { const p = pctDiferencia(kgBodega, kgOdoo); return p === null ? null : Math.round(p * 10) / 10; })(),
    pesadas, unidades, movimientos,
  };
}

/**
 * La frase que explica el estado. Una sola, corta, y que diga QUÉ HACER cuando hay algo que hacer.
 *
 * El caso `revisar` nombra las dos causas posibles y no elige: puede faltar carga por registrar, o
 * puede que un movimiento de Odoo no haya llegado al andén. Desde la tarjeta no se puede saber
 * cuál, y afirmar una sería adivinar.
 */
export function fraseDeEstado(b: BloqueCruce): string {
  if (b.estado === 'sin-pesar') {
    return b.kgOdoo > 0
      ? `Odoo ya dice ${enKg(b.kgOdoo)} kg. La diferencia aparece cuando se pese.`
      : 'Todavía no hay movimientos de Odoo para esta tienda.';
  }
  if (b.estado === 'revisar') {
    return `Odoo dice ${enKg(b.kgOdoo)} y en Bodega hay ${enKg(b.kgBodega as number)}. `
         + 'Falta registrar carga, o un movimiento no llegó al andén.';
  }
  return 'Dentro de lo normal.';
}

/** `1.147,45` — como se escriben los números en Chile. */
export function enKg(n: number): string {
  return n.toLocaleString('es-CL', { maximumFractionDigits: 2 });
}
