// [E8] Etiqueta de zona·modo y aviso de transportista por camión, para el tablero del Enrutador.
// Puro y testeable. La configuración (ConfigZonas) se inyecta ya cargada; acá no hay red.

import type { TiendaInfo } from '../data/tiendas';
import { zonaDeSector, type ZonaRuteo } from '@/lib/sectores';
import { empresaHabilitada, type ConfigZonas, type ModoZona } from './zonasTransporte';

export const ZONA_LABEL: Record<ZonaRuteo, string> = {
  santiago: 'Santiago', costa: 'Costa', sur: 'Sur', norte: 'Norte',
};

const MODO_LABEL: Record<ModoZona, string> = { ruta: 'ruta', consolidacion: 'consolidación' };

/** Zona de una tienda por su sector; 'Región' a secas (sin norte/sur) cuenta como Regiones→sur. */
function zonaDeTienda(cod: string, tiendas: Record<string, TiendaInfo>): ZonaRuteo | null {
  const sector = (tiendas[cod] as { sector?: string } | undefined)?.sector;
  const z = zonaDeSector(sector);
  if (z) return z;
  return String(sector ?? '').trim().toLowerCase().startsWith('regi') ? 'sur' : null;
}

/** Zona DOMINANTE de un camión, según los sectores de sus tiendas. null si no se puede determinar. */
export function zonaDeCamion(stores: { c: string }[], tiendas: Record<string, TiendaInfo>): ZonaRuteo | null {
  const conteo = new Map<ZonaRuteo, number>();
  for (const s of stores) {
    const z = zonaDeTienda(s.c, tiendas);
    if (z) conteo.set(z, (conteo.get(z) ?? 0) + 1);
  }
  let best: ZonaRuteo | null = null, max = 0;
  for (const [z, n] of conteo) if (n > max) { max = n; best = z; }
  return best;
}

export interface EtiquetaCamion { zona: ZonaRuteo; modo: ModoZona; label: string; }

/**
 * Etiqueta "Santiago · ruta" / "Sur · consolidación" del camión. El modo sale de la config; si no
 * hay config, cae al default geográfico (sur/norte consolidan, santiago/costa rutean). null si el
 * camión no tiene tiendas con zona conocida (no se muestra etiqueta).
 */
export function etiquetaCamion(
  stores: { c: string }[], tiendas: Record<string, TiendaInfo>, cfg?: ConfigZonas,
): EtiquetaCamion | null {
  const zona = zonaDeCamion(stores, tiendas);
  if (!zona) return null;
  const modo: ModoZona = cfg?.[zona]?.modo ?? (zona === 'sur' || zona === 'norte' ? 'consolidacion' : 'ruta');
  return { zona, modo, label: `${ZONA_LABEL[zona]} · ${MODO_LABEL[modo]}` };
}

/**
 * Aviso si la EMPRESA del camión no está habilitada para la zona que lleva. Mismo sentido que el
 * aviso del motor (enrutadorV2), pero calculado en vivo en el tablero manual, donde el motor no
 * corre. null si no hay config, si no se puede determinar la zona, si la zona está inactiva, o si la
 * empresa sí está habilitada.
 */
export function avisoCamionNoHabilitado(
  patente: string, empresa: string | undefined | null,
  stores: { c: string }[], tiendas: Record<string, TiendaInfo>, cfg?: ConfigZonas,
): string | null {
  if (!cfg) return null;
  const zona = zonaDeCamion(stores, tiendas);
  if (!zona) return null;
  const c = cfg[zona];
  if (!c || !c.activo) return null;
  if (empresaHabilitada(empresa, c)) return null;
  return `${patente} (${empresa || 'sin empresa'}) no está habilitado para ${ZONA_LABEL[zona]}`;
}
