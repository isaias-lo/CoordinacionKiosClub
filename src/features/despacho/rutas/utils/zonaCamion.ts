// [E8] Etiqueta de zona·modo y avisos de transportista por camión, para el tablero del Enrutador.
// Puro y testeable. La configuración (ConfigZonas) se inyecta ya cargada; acá no hay red.

import type { TiendaInfo } from '../data/tiendas';
import { zonaDeSectorOGeo, type ZonaRuteo } from '@/lib/sectores';
import { dkm } from './helpers';
import { OPCIONES_DEFAULT } from './enrutadorV2';
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
 * Zona de una tienda. Dos capas de resolución, sin depender de un solo campo:
 *  1) `zonaDeSectorOGeo(sector, lat, latCD)` — usa el sector; 'Región' a secas lo parte por latitud.
 *  2) DEFENSA: si el sector no resuelve (vacío / no cargado — el bug de que `sector` nunca se
 *     escribía dejaba TODO en null), cae a DISTANCIA al CD con los mismos umbrales que el motor
 *     (enrutadorV2.zonaDeTienda): dentro de radioRMKm → santiago; hasta radioCostaKm → costa; más
 *     lejos → sur/norte por latitud. Así el tablero no queda inerte aunque falte el sector.
 */
function zonaDeTienda(cod: string, tiendas: Record<string, TiendaInfo>, gps: Record<string, number[]>, cd: number[]): ZonaRuteo | null {
  const latCD = cd[0];
  const g = gps[cod];
  const lat = g?.[0];   // gps = [lat, lon]
  const porSectorOGeo = zonaDeSectorOGeo((tiendas[cod] as { sector?: string } | undefined)?.sector, lat, latCD);
  if (porSectorOGeo) return porSectorOGeo;

  // Defensa por distancia (necesita GPS).
  if (!g) return null;
  const dist = dkm(g, cd);
  const { radioRMKm, radioCostaKm } = OPCIONES_DEFAULT;
  if (radioRMKm > 0 && dist > radioRMKm) {
    if (radioCostaKm <= 0 || dist <= radioCostaKm) return 'costa';
    return (lat != null && Number.isFinite(lat) && lat >= latCD) ? 'norte' : 'sur';
  }
  return 'santiago';
}

/** Cuenta cuántas tiendas del camión caen en cada zona. */
export function contarZonas(
  stores: { c: string }[], tiendas: Record<string, TiendaInfo>, gps: Record<string, number[]>, cd: number[],
): Map<ZonaRuteo, number> {
  const conteo = new Map<ZonaRuteo, number>();
  for (const s of stores) {
    const z = zonaDeTienda(s.c, tiendas, gps, cd);
    if (z) conteo.set(z, (conteo.get(z) ?? 0) + 1);
  }
  return conteo;
}

/** TODAS las zonas que lleva el camión, ordenadas por `orden` (para avisar por cada una). */
export function zonasDeCamion(
  stores: { c: string }[], tiendas: Record<string, TiendaInfo>, gps: Record<string, number[]>, cd: number[], cfg?: ConfigZonas,
): ZonaRuteo[] {
  return [...contarZonas(stores, tiendas, gps, cd).keys()].sort((a, b) => ordenZona(a, cfg) - ordenZona(b, cfg));
}

/**
 * Zona DOMINANTE del camión (la que muestra la etiqueta). Máx. cantidad de tiendas; el empate se
 * rompe de forma ESTABLE por menor `orden` (antes dependía del orden en que llegaban las tiendas).
 */
export function zonaDeCamion(
  stores: { c: string }[], tiendas: Record<string, TiendaInfo>, gps: Record<string, number[]>, cd: number[], cfg?: ConfigZonas,
): ZonaRuteo | null {
  const entries = [...contarZonas(stores, tiendas, gps, cd).entries()];
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
  stores: { c: string }[], tiendas: Record<string, TiendaInfo>, gps: Record<string, number[]>, cd: number[], cfg?: ConfigZonas,
): EtiquetaCamion | null {
  const zona = zonaDeCamion(stores, tiendas, gps, cd, cfg);
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
  stores: { c: string }[], tiendas: Record<string, TiendaInfo>, gps: Record<string, number[]>, cd: number[], cfg?: ConfigZonas,
): string[] {
  if (!cfg) return [];
  const out: string[] = [];
  for (const zona of zonasDeCamion(stores, tiendas, gps, cd, cfg)) {
    const c = cfg[zona];
    if (!c || !c.activo) continue;
    if (empresaHabilitada(empresa, c)) continue;
    out.push(`${patente} (${empresa || 'sin empresa'}) no está habilitado para ${ZONA_LABEL[zona]}`);
  }
  return out;
}
