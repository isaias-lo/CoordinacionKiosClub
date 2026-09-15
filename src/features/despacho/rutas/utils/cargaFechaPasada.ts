// Meter la carga de un día pasado en el pool del tablero. Puro y testeable.
//
// El cargador de fecha pasada tenía esta regla:
//
//     if (!next[c]) { next[c] = { on: true, p, b, ... } }   // "solo AGREGA lo que no esté"
//
// La intención era buena —no pisar las asignaciones ya cargadas— pero deja afuera justo el caso
// normal: las tiendas del CALENDARIO de ese día ya están en `calT`, con p:0 y b:0, porque los
// conteos llegan por otro camino (la suscripción a `despacho_sesion`, que es solo de HOY). El
// cargador las ve, dice "esta ya está", y nunca les pone la carga.
//
// Resultado: al abrir una fecha pasada, las tiendas del calendario aparecen VACÍAS. Y como
// `enElPool` exige `on && tieneCarga`, quedan fuera del pool — así que "Terminar día" calculaba
// cero sobrantes y no mandaba nada a 2ª vuelta. Tres días seguidos (10, 11 y 14 de septiembre)
// quedaron sin backlog por esto.
//
// La regla correcta no es "agregar lo que falta" sino "completar lo que está vacío": si la entrada
// ya tiene carga, esa manda (viene del tablero y es más fresca); si no tiene, se le pone la del
// día. Nunca se pisa un conteo real con otro.

/** Misma forma que el `CalData` del tablero: `c` y `ch` van siempre, `g` es opcional. */
export interface EntradaCalT {
  on: boolean; p: number; b: number; c: number; ch: number; g?: string;
}

export interface FilaCarga {
  cod: string; pallets: number; bultos: number; contenedores?: number; chocolates?: number;
}

const tieneCarga = (d?: EntradaCalT) =>
  !!d && (d.p > 0 || d.b > 0 || d.c > 0 || d.ch > 0);

/**
 * Devuelve el `calT` con la carga del día aplicada, o el mismo objeto si nada cambió.
 *
 * `grupoDe` ubica a una tienda que no venía en el calendario.
 */
export function aplicarCargaDelDia(
  calT: Record<string, EntradaCalT>,
  filas: FilaCarga[],
  grupoDe: (cod: string) => string,
): Record<string, EntradaCalT> {
  const next = { ...calT };
  let cambió = false;

  for (const f of filas) {
    const c  = f.cod;
    if (!c) continue;
    const p  = (f.pallets ?? 0);
    const b  = (f.bultos ?? 0);
    const cc = (f.contenedores ?? 0);
    const ch = (f.chocolates ?? 0);
    if (p === 0 && b === 0 && cc === 0 && ch === 0) continue;   // sin carga no aporta nada

    const previo = next[c];
    // Ya tiene conteos del tablero: esos mandan, son más frescos.
    if (tieneCarga(previo)) continue;

    next[c] = previo
      // Estaba en el calendario pero vacía: se le completa la carga y se prende.
      ? { ...previo, on: true, p, b, c: cc, ch }
      // No estaba: entra con su grupo.
      : { on: true, p, b, c: cc, ch, g: grupoDe(c) };
    cambió = true;
  }

  return cambió ? next : calT;
}
