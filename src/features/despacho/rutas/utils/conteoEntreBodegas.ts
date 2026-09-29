import type { SesionRow } from '@/lib/despachoSesion';

// Una misma tienda puede tener fila de `despacho_sesion` en LAS DOS bodegas de seco ('santiago' =
// RM/Costa y 'regiones' = Nacional). Pasa cuando se pesa en la bodega RM un pallet de una tienda de
// Regiones —p. ej. escaneando su etiqueta—: el ítem queda en las dos copias con el MISMO slot de
// picking. Medido el 29/09: 8 tiendas 'fal' (36CHL, 27MCH, 46TRE…) con fila en ambas, y en las 8
// los slots de RM eran un subconjunto de los de Nacional (36CHL: RM 2P/0B, Nacional 4P/8B).
//
// Todo lo que lee estos conteos los indexaba por CÓDIGO de tienda y se quedaba con la última fila
// que llegaba. El resultado dependía del equipo: en la PC donde corre Bodega Nacional el
// localStorage re-aplicaba los de Regiones cada 2 s ("con admin se ve bien"); en el resto ganaba la
// fila que llegara última de la base —muchas veces la copia parcial de RM—: "salen pallets menos y
// bultos menos".
//
// Regla: el MÁXIMO por campo, no la suma. Son las mismas unidades vistas desde dos pantallas, así
// que sumar contaría doble; y como una copia suele ser un subconjunto de la otra, el máximo es lo
// que la bodega más completa registró. Es determinista: todos los equipos ven lo mismo.

/** ¿La fila es de seco? Congelados tiene su propio pool y nunca se combina con seco. */
export function esFilaSeco(row: Pick<SesionRow, 'fuente'>): boolean {
  return !(row.fuente ?? '').startsWith('congelados');
}

const total = (r: SesionRow) => (r.pallets ?? 0) + (r.bultos ?? 0) + (r.contenedores ?? 0) + (r.chocolates ?? 0);

/**
 * Combina las filas de seco de UNA tienda (una por bodega) en una sola. `fuente` queda la de la
 * fila con más carga (desempate: 'regiones'), que es la que usa `grupoArmada` para ubicar una
 * tienda que no está en el calendario.
 */
export function combinarFilasSeco(filas: SesionRow[]): SesionRow {
  const [primera, ...resto] = filas;
  if (!resto.length) return primera;
  const principal = filas.reduce((a, b) =>
    total(b) > total(a) || (total(b) === total(a) && b.fuente === 'regiones') ? b : a);
  return {
    ...principal,
    pallets:      Math.max(...filas.map(f => f.pallets ?? 0)),
    bultos:       Math.max(...filas.map(f => f.bultos ?? 0)),
    contenedores: Math.max(...filas.map(f => f.contenedores ?? 0)),
    chocolates:   Math.max(...filas.map(f => f.chocolates ?? 0)),
  };
}

/** Memoria de la última fila de cada tienda por bodega: código → fuente → fila. */
export type FilasPorBodega = Map<string, Map<string, SesionRow>>;

/**
 * Registra la fila que acaba de llegar (Realtime, carga inicial o localStorage) y devuelve la fila
 * EFECTIVA de la tienda, ya combinada con lo que la otra bodega haya reportado.
 */
export function registrarFilaSeco(memoria: FilasPorBodega, cod: string, row: SesionRow): SesionRow {
  const porFuente = memoria.get(cod) ?? new Map<string, SesionRow>();
  porFuente.set(row.fuente, row);
  memoria.set(cod, porFuente);
  return combinarFilasSeco([...porFuente.values()]);
}

/**
 * Para las lecturas de una sola vez (fecha pasada, Manual): una fila por tienda. Congelados pasa
 * tal cual. `normCod` es la normalización de códigos del llamador (23PEÑ/23PEN, espacios…).
 */
export function combinarPorTienda<T extends SesionRow>(rows: T[], normCod: (c: string) => string = c => c): T[] {
  const seco = new Map<string, T[]>();
  const otras: T[] = [];
  for (const r of rows) {
    if (!esFilaSeco(r)) { otras.push(r); continue; }
    const k = normCod(r.tienda_cod);
    seco.set(k, [...(seco.get(k) ?? []), r]);
  }
  return [...[...seco.values()].map(g => combinarFilasSeco(g) as T), ...otras];
}
