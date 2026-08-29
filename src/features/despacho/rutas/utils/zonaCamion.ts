// [E8] Etiqueta de zona·modo y avisos de transportista por camión, para el tablero del Enrutador.
// Puro y testeable. La configuración (ConfigZonas) se inyecta ya cargada; acá no hay red.

import type { TiendaInfo } from '../data/tiendas';
import { zonaDeSectorOGeo, type ZonaRuteo } from '@/lib/sectores';
import { empresaHabilitada, ZONAS_DEFAULT, type ConfigZonas, type ModoZona } from './zonasTransporte';

export const ZONA_LABEL: Record<ZonaRuteo, string> = {
  santiago: 'Santiago', costa: 'Costa', sur: 'Sur', norte: 'Norte',
};

const MODO_LABEL: Record<ModoZona, string> = { ruta: 'ruta', consolidacion: 'consolidación' };

/** Orden de la zona (para desempatar la zona dominante de forma ESTABLE): el de la config, o el
 *  default (sur=1, norte=2, costa=3, santiago=4). Menor orden gana el empate. */
function ordenZona(z: ZonaRuteo, cfg?: ConfigZonas): number {
  return cfg?.[z]?.orden ?? ZONAS_DEFAULT[z].orden;
}

/**
 * Zona de una tienda. Usa `zonaDeSectorOGeo`, que resuelve las 17 tiendas cargadas con sector
 * 'Región' a secas por LATITUD (norte/sur) — sin esto, las del norte (39PSB, 41ANA, 42ANP, 51SER)
 * caían todas en 'sur' y un camión habilitado para Norte salía marcado como no habilitado.
 */
function zonaDeTienda(cod: string, tiendas: Record<string, TiendaInfo>, gps: Record<string, number[]>, latCD: number): ZonaRuteo | null {
  const sector = (tiendas[cod] as { sector?: string } | undefined)?.sector;
  const lat = gps[cod]?.[0];   // gps = [lat, lon]
  return zonaDeSectorOGeo(sector, lat, latCD);
}

/** Cuenta cuántas tiendas del camión caen en cada zona. */
export function contarZonas(
  stores: { c: string }[], tiendas: Record<string, TiendaInfo>, gps: Record<string, number[]>, latCD: number,
): Map<ZonaRuteo, number> {
  const conteo = new Map<ZonaRuteo, number>();
  for (const s of stores) {
    const z = zonaDeTienda(s.c, tiendas, gps, latCD);
    if (z) conteo.set(z, (conteo.get(z) ?? 0) + 1);
  }
  return conteo;
}

/** TODAS las zonas que lleva el camión, ordenadas por `orden` (para avisar por cada una). */
export function zonasDeCamion(
  stores: { c: string }[], tiendas: Record<string, TiendaInfo>, gps: Record<string, number[]>, latCD: number, cfg?: ConfigZonas,
): ZonaRuteo[] {
  return [...contarZonas(stores, tiendas, gps, latCD).keys()].sort((a, b) => ordenZona(a, cfg) - ordenZona(b, cfg));
}

/**
 * Zona DOMINANTE del camión (la que muestra la etiqueta). Máx. cantidad de tiendas; el empate se
 * rompe de forma ESTABLE por menor `orden` (antes dependía del orden en que llegaban las tiendas).
 */
export function zonaDeCamion(
  stores: { c: string }[], tiendas: Record<string, TiendaInfo>, gps: Record<string, number[]>, latCD: number, cfg?: ConfigZonas,
): ZonaRuteo | null {
  const entries = [...contarZonas(stores, tiendas, gps, latCD).entries()];
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1] || ordenZona(a[0], cfg) - ordenZona(b[0], cfg));
  return entries[0][0];
}

export interface EtiquetaCamion { zona: ZonaRuteo; modo: ModoZona; label: string; }

/**
 * Etiqueta "Santiago · ruta" / "Sur · consolidación" del camión, por su zona dominante. El modo sale
 * de la config; sin config cae al default geográfico (sur/norte consolidan, santiago/costa rutean).
 * null si el camión no tiene tiendas con zona conocida.
 */
export function etiquetaCamion(
  stores: { c: string }[], tiendas: Record<string, TiendaInfo>, gps: Record<string, number[]>, latCD: number, cfg?: ConfigZonas,
): EtiquetaCamion | null {
  const zona = zonaDeCamion(stores, tiendas, gps, latCD, cfg);
  if (!zona) return null;
  const modo: ModoZona = cfg?.[zona]?.modo ?? (zona === 'sur' || zona === 'norte' ? 'consolidacion' : 'ruta');
  return { zona, modo, label: `${ZONA_LABEL[zona]} · ${MODO_LABEL[modo]}` };
}

/**
 * Avisos si la EMPRESA del camión no está habilitada para ALGUNA zona que lleva. Devuelve uno por
 * zona problemática (un camión con sur y norte se evalúa contra ambas, igual que enrutadorV2). Mismo
 * sentido que el aviso del motor, pero calculado en vivo en el tablero manual donde el motor no corre.
 */
export function avisosCamionNoHabilitado(
  patente: string, empresa: string | undefined | null,
  stores: { c: string }[], tiendas: Record<string, TiendaInfo>, gps: Record<string, number[]>, latCD: number, cfg?: ConfigZonas,
): string[] {
  if (!cfg) return [];
  const out: string[] = [];
  for (const zona of zonasDeCamion(stores, tiendas, gps, latCD, cfg)) {
    const c = cfg[zona];
    if (!c || !c.activo) continue;
    if (empresaHabilitada(empresa, c)) continue;
    out.push(`${patente} (${empresa || 'sin empresa'}) no está habilitado para ${ZONA_LABEL[zona]}`);
  }
  return out;
}
