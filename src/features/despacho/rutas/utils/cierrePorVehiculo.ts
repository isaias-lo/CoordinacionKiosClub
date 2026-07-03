// Lógica pura del "cierre por vehículo" en 1ª vuelta (Fase B).
//
// En el Enrutador (1ª vuelta) el registro es GLOBAL: un botón registra TODAS las rutas.
// La Fase B añade cerrar/registrar UN vehículo (patente) a la vez, conviviendo con el global:
//  - El registro global SALTA los vehículos ya cerrados individualmente (HISTORIAL es
//    append-only → re-escribir DUPLICA; ver idempotencia).
//  - El día se marca registrado (`rutas_reg`, apaga el aviso) SOLO cuando TODOS los
//    vehículos están cerrados, o cuando se usa el registro global.
//  - El set de patentes cerradas del día se persiste en `shared_session_state`
//    (fuente `'rutas_cerradas'`, keyed por fecha, JSON) para sync cross-device.
//
// Estas funciones son puras y se testean sin tocar Sheets/BD/React.

/** Normaliza una patente para comparaciones robustas (trim + mayúsculas). */
export function normPatente(p: string): string {
  return (p ?? '').trim().toUpperCase();
}

/**
 * Extrae el set (normalizado) de patentes cerradas desde el estado remoto de
 * `'rutas_cerradas'`. Tolera formas: `{ patentes: [...] }`, un array plano, o null.
 */
export function parseCerradas(state: unknown): Set<string> {
  const out = new Set<string>();
  if (!state) return out;
  let list: unknown[] = [];
  if (Array.isArray(state)) list = state;
  else if (typeof state === 'object') {
    const p = (state as { patentes?: unknown }).patentes;
    if (Array.isArray(p)) list = p;
  }
  for (const x of list) {
    if (typeof x === 'string' && x.trim()) out.add(normPatente(x));
  }
  return out;
}

/** Serializa el set de patentes cerradas al payload que se guarda en `'rutas_cerradas'`. */
export function serializeCerradas(patentes: Set<string>): { patentes: string[] } {
  return { patentes: [...patentes] };
}

/**
 * Merge cross-device de patentes cerradas: la unión de lo local y lo remoto.
 * Cerrar es monótono (un cierre no se "des-cierra" por un eco viejo), así que unir es correcto.
 */
export function mergeCerradas(local: Iterable<string>, remote: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const p of local)  { const n = normPatente(p); if (n) out.add(n); }
  for (const p of remote) { const n = normPatente(p); if (n) out.add(n); }
  return out;
}

/** ¿La patente `p` está en el set de cerradas (comparación normalizada)? */
export function isCerrada(cerradas: Set<string>, p: string): boolean {
  return cerradas.has(normPatente(p));
}

export interface RutaLike { v: { p: string }; ts: unknown[] }

/**
 * Filtra las rutas cuya patente YA está cerrada individualmente → deja solo lo que
 * el registro global todavía debe escribir (evita duplicar en hojas append-only).
 */
export function rutasNoCerradas<T extends RutaLike>(rutas: T[], cerradas: Set<string>): T[] {
  return rutas.filter(r => !isCerrada(cerradas, r.v.p));
}

/**
 * ¿Están TODAS las rutas (con al menos una tienda) cerradas? Base para decidir si un cierre
 * parcial completó el día (→ postear summary + marcar `rutas_reg`). Requiere ≥1 ruta.
 * Las rutas vacías (sin tiendas) no cuentan como pendientes.
 */
export function todasCerradas(rutas: RutaLike[], cerradas: Set<string>): boolean {
  const conTiendas = rutas.filter(r => r.ts.length > 0);
  if (conTiendas.length === 0) return false;
  return conTiendas.every(r => isCerrada(cerradas, r.v.p));
}
