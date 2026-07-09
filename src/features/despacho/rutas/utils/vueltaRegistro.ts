// Lógica pura del registro de despacho con 2ª vuelta (RM + Regiones).
//
// El Enrutador rutea RM/Costa + Regiones juntos, pero hoy el registro solo escribe a
// despacho_rm/DESPACHO RM → la patente de las tiendas de Regiones se pierde, y las
// tiendas sin asignar (pendientes 2ª vuelta) no aparecen en CONTROL DESPACHO (conteo
// corto: 25 vs 30). Estas funciones puras deciden "qué va a dónde" y se testean sin
// tocar Sheets/BD.

export type Grupo = 'rm' | 'costa' | 'fal';
export type Tabla = 'despacho_rm' | 'despacho_regiones';

/** RM/Costa → despacho_rm ; Regiones (fal) → despacho_regiones. */
export function tablaDeGrupo(g?: Grupo): Tabla {
  return g === 'fal' ? 'despacho_regiones' : 'despacho_rm';
}

export interface RoutingUpdate {
  cod: string;
  conductor: string;
  patente: string;
  transporte: string;
  ruta: string;
  supervisor: string;
  vuelta?: number;
  pioneta_1?: string | null;
  pioneta_2?: string | null;
}

/**
 * Separa los updates de ruteo por tabla destino según el grupo de cada tienda.
 * `grupoPorCod` devuelve el grupo de un cod (desde calT); si no se conoce, cae en RM.
 */
export function splitRoutingPorTabla(
  updates: RoutingUpdate[],
  grupoPorCod: (cod: string) => Grupo | undefined,
): Record<Tabla, RoutingUpdate[]> {
  const out: Record<Tabla, RoutingUpdate[]> = { despacho_rm: [], despacho_regiones: [] };
  for (const u of updates) out[tablaDeGrupo(grupoPorCod(u.cod))].push(u);
  return out;
}

export interface RutaControl {
  patente: string;
  tlbd: boolean;                 // true → 2ª vuelta (la patente va en la columna v2)
  ts: { c: string; p: number; b: number; ch?: number }[];
}
export interface PendienteControl { c: string; p: number; b: number; ch?: number }

/**
 * Filas de CONTROL DESPACHO [fecha, dia, cod, p, b, patente_v1, patente_v2].
 * Incluye las tiendas ruteadas (con su patente en la vuelta que corresponde) Y las
 * pendientes (sin patente en ninguna vuelta) → el conteo cuadra (ej. 30, no 25).
 * Los chocolates se suman a bultos (igual que en el resto del flujo).
 */
export function buildControlRows(
  fechaDDMM: string,
  dia: string,
  rutas: RutaControl[],
  pendientes: PendienteControl[],
): (string | number)[][] {
  const map = new Map<string, { p: number; b: number; v1: string; v2: string }>();

  for (const ruta of rutas) {
    const isV2 = ruta.tlbd;
    const pat  = ruta.patente;
    for (const t of ruta.ts) {
      const ex = map.get(t.c);
      if (!ex) {
        map.set(t.c, { p: t.p, b: t.b + (t.ch ?? 0), v1: isV2 ? '' : pat, v2: isV2 ? pat : '' });
      } else if (isV2) {
        ex.v2 = pat;
      } else {
        ex.v1 = pat;
      }
    }
  }

  // Pendientes: solo las que no quedaron ya ruteadas — patente vacía en ambas vueltas.
  for (const p of pendientes) {
    if (!map.has(p.c)) map.set(p.c, { p: p.p, b: p.b + (p.ch ?? 0), v1: '', v2: '' });
  }

  return [...map.entries()].map(([cod, d]) => [fechaDDMM, dia, cod, d.p, d.b, d.v1, d.v2]);
}

/**
 * Agrupa las tiendas de un camión de 2ª vuelta por su fecha de ORIGEN (el día en que quedaron
 * pendientes). La 2ª vuelta debe registrarse bajo la fecha original → así rellena la columna
 * "Patente 2. Vuelta" de la fila YA existente (CONTROL DESPACHO y despacho_rm/regiones hacen
 * upsert por `fecha::cod`) en vez de crear una fila nueva bajo "hoy" (el bug de duplicado).
 *
 * - Una tienda que quedó pendiente en varios días se agrupa en CADA una de esas fechas.
 * - Las tiendas sin origen conocido caen en `fallbackFecha` (hoy).
 * - `norm` se inyecta para casar códigos de forma robusta (mayúsculas/acentos/alias).
 */
export function agruparPorFechaOrigen<T extends { c: string }>(
  stores: T[],
  pendientesOrigen: { c: string; fechaOrigen: string }[],
  fallbackFecha: string,
  norm: (s: string) => string,
): Map<string, T[]> {
  const origenPorCod = new Map<string, string[]>();
  for (const p of pendientesOrigen) {
    const k = norm(p.c);
    const arr = origenPorCod.get(k) ?? [];
    if (!arr.includes(p.fechaOrigen)) arr.push(p.fechaOrigen);
    origenPorCod.set(k, arr);
  }
  const out = new Map<string, T[]>();
  for (const t of stores) {
    const fechas = origenPorCod.get(norm(t.c)) ?? [fallbackFecha];
    for (const f of fechas) {
      const arr = out.get(f) ?? [];
      arr.push(t);
      out.set(f, arr);
    }
  }
  return out;
}
