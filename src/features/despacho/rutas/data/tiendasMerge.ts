// Fusión del catálogo ESTÁTICO (TIENDAS_INICIAL) con la tabla `tiendas` de la BD.
// Puro (sin red ni React) → testeable. Permite que las tiendas creadas/editadas en
// Config aparezcan en toda la app sin tocar código, usando el estático como respaldo.
import { normalizeCod } from '@/app/api/tiendas/sync/normalizeCod';
import type { TiendaInfo } from './tiendas';
import { corredorAuto } from '../utils/corredorAsignar';

/** Fila de la tabla `tiendas` (subconjunto usado para fusionar). */
export interface DbTiendaRow {
  codigo: string;
  nombre?: string;
  direccion?: string;
  region?: string;
  sector_comuna?: string;
  corredor?: string;
  tipo?: string;
  ventana?: string;
  frecuencia?: string;
  correos?: string;
  lat?: number | null;
  lon?: number | null;
  activo?: boolean;
}

/** GPS dentro del rango válido de Chile continental + insular cercano. */
export function isValidChileGps(lat?: number | null, lon?: number | null): boolean {
  return (
    lat != null && lon != null &&
    !isNaN(lat) && !isNaN(lon) &&
    lat > -60 && lat < -17 &&
    lon > -76 && lon < -66
  );
}

/**
 * Fusiona el catálogo estático con las filas de la BD.
 * - La BD MANDA campo por campo, pero si un campo viene vacío se conserva el del estático
 *   (no se pierde info curada). Una tienda solo-BD se AGREGA.
 * - Las inactivas (activo === false) se omiten.
 */
export function mergeTiendas(
  staticMap: Record<string, TiendaInfo>,
  dbRows: DbTiendaRow[],
  corredorFn: (t: { lat?: number | null; lng?: number | null; comuna?: string | null; direccion?: string | null }) => string | null = corredorAuto,
): Record<string, TiendaInfo> {
  const merged: Record<string, TiendaInfo> = { ...staticMap };
  for (const t of dbRows ?? []) {
    if (t.activo === false) continue;
    const cod = normalizeCod(t.codigo || '');
    if (!cod) continue;
    const base = merged[cod];
    merged[cod] = {
      ...base,
      n: t.nombre || base?.n || cod,
      // `z` = CORREDOR de la tienda (para display/agrupación). Prioridad: corredor explícito de
      // la BD → corredor del catálogo estático → auto-asignado por GPS/comuna → comuna (último
      // recurso). Antes la comuna PISABA el corredor (26ALC mostraba "Las Condes" en vez de
      // "Corredor Oriente"). No afecta el ruteo (`asignar` no usa `z`).
      z: t.corredor || base?.z || corredorFn({ lat: t.lat, lng: t.lon, comuna: t.sector_comuna, direccion: t.direccion }) || t.sector_comuna || '',
      sector: t.sector_comuna || base?.sector || '',
      v: t.ventana ?? base?.v ?? '',
      d: t.direccion || base?.d,
      region: t.region || base?.region,
      corredor: t.corredor || base?.corredor,
      tipo: t.tipo || base?.tipo,
      frecuencia: t.frecuencia || base?.frecuencia,
      correos: t.correos || base?.correos,
    };
  }
  return merged;
}
