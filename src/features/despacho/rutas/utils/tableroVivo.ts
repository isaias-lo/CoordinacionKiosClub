import type { UnidadSalida, TipoCarga } from './enrutadorIncremental';

const TZ_CHILE = 'America/Santiago';
const TIPOS: readonly TipoCarga[] = ['P', 'B', 'C', 'CH'];

/** Fila cruda de `picking_pallets` tal como la devuelve `/api/picking-pallets?date=`. */
export interface FilaPicking {
  store_cod?: string | null;
  tipo?: string | null;
  created_at?: string | null;
}

/**
 * Minuto del día (0..1439) EN HORA DE CHILE para un timestamp.
 *
 * `picking_pallets.created_at` viene en UTC, pero el CD razona en hora local: el corte de las
 * 15:00 y el silencio de 90 min del motor incremental se miden en minutos-desde-medianoche de
 * Chile. Si no se convierte, esos cortes quedan corridos 3-4 h (el offset Chile↔UTC) y el tablero
 * cierra camiones antes o después de lo que debe. `Intl` con `America/Santiago` resuelve solo el
 * horario de verano (UTC-3 en verano, UTC-4 en invierno). Devuelve NaN si el timestamp no parsea.
 */
export function minutoChile(iso: string | null | undefined): number {
  const s = String(iso ?? '').trim();
  if (!s) return NaN;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return NaN;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ_CHILE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const hh = Number(parts.find(p => p.type === 'hour')?.value);
  const mm = Number(parts.find(p => p.type === 'minute')?.value);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return NaN;
  return ((hh % 24) * 60) + mm; // %24: algún engine emite '24' a medianoche
}

/** Minuto del día actual en Chile — el parámetro `ahora` del motor incremental. */
export function ahoraMinutoChile(now: Date = new Date()): number {
  return minutoChile(now.toISOString());
}

export function esTipoCarga(t: string): t is TipoCarga {
  return (TIPOS as readonly string[]).includes(t);
}

/** Convierte una fila de `picking_pallets` a `UnidadSalida`; null si le falta lo esencial. */
export function filaAUnidad(f: FilaPicking): UnidadSalida | null {
  const cod = String(f.store_cod ?? '').trim();
  const tipo = String(f.tipo ?? '').trim().toUpperCase();
  const minuto = minutoChile(f.created_at);
  if (!cod || !esTipoCarga(tipo) || !Number.isFinite(minuto)) return null;
  return { cod, tipo, minuto };
}

/** Mapea las filas activas del día a `UnidadSalida[]`, descartando las inválidas. */
export function unidadesDesdeFilas(filas: FilaPicking[]): UnidadSalida[] {
  return filas.map(filaAUnidad).filter((u): u is UnidadSalida => u !== null);
}
