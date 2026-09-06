import { TIENDAS_INICIAL, type TiendaInfo } from '@/features/despacho/rutas/data/tiendas';
import { grupoDeSector } from '@/lib/sectores';

export type ZonaAdelanto = 'rm' | 'costa' | 'fal';

export interface TiendaAdelanto {
  id:             number;
  fecha:          string;        // YYYY-MM-DD (día en que entra al flujo)
  store_cod:      string;
  zona:           ZonaAdelanto;
  tipo:           string;        // 'adelanto'
  fecha_despacho: string | null; // YYYY-MM-DD (cuándo se despacharía)
  creado_por:     string | null;
  created_at:     string;
}

/**
 * Zona por defecto de una tienda para el flujo de adelanto, derivada de su SECTOR:
 *  - 'Costa'      → 'costa' (Bodega Costa, Valparaíso)
 *  - 'Región…'    → 'fal'   (Bodega Regiones / NACIONAL)
 *  - corredores   → 'rm'    (Bodega Santiago / METROPOLITANA)
 * Es solo un default; la UI permite ajustarlo manualmente.
 *
 * Antes la segunda mitad la decidía la REGIÓN (`region === 'RM'`). Funcionaba, pero ataba una
 * decisión de ruteo a un campo de etiqueta: renombrar 'RM' —por ejemplo para adoptar el nombre
 * que devuelve Google— habría mandado las 39 tiendas de Santiago a Regiones sin un solo error.
 * Verificado sobre las 62 tiendas activas: el resultado es idéntico tienda por tienda.
 *
 * Sin sector no se puede saber, y el default sigue siendo 'rm' como hasta ahora.
 */
export function zonaForStore(cod: string, tienda?: TiendaInfo): ZonaAdelanto {
  // Si se pasa la info fusionada (BD + estático), se usa esa; sino cae al catálogo estático.
  const info = tienda ?? TIENDAS_INICIAL[(cod ?? '').toUpperCase()];
  if (!info) return 'rm';
  // `sector` solo lo trae la BD; las fichas estáticas lo tienen en `z`.
  return grupoDeSector(info.sector ?? info.z) ?? 'rm';
}

/** Hoy en formato YYYY-MM-DD (hora local del dispositivo). */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function getTiendasAdelanto(fecha: string): Promise<TiendaAdelanto[]> {
  try {
    const res = await fetch(`/api/tiendas-adelanto?fecha=${encodeURIComponent(fecha)}`);
    if (!res.ok) return [];
    const json = await res.json() as { data?: TiendaAdelanto[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

/** Tiendas de adelanto de HOY (las que deben aparecer en el flujo). */
export function getTiendasAdelantoHoy(): Promise<TiendaAdelanto[]> {
  return getTiendasAdelanto(todayISO());
}

export async function addTiendaAdelanto(input: {
  fecha: string; store_cod: string; zona: ZonaAdelanto;
  tipo?: string; fecha_despacho?: string | null; creado_por?: string;
}): Promise<{ ok: boolean; data?: TiendaAdelanto; error?: string }> {
  try {
    const res = await fetch('/api/tiendas-adelanto', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json = await res.json() as { data?: TiendaAdelanto; error?: string };
    if (!res.ok) return { ok: false, error: json.error ?? 'Error al agregar' };
    return { ok: true, data: json.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de conexión' };
  }
}

export async function deleteTiendaAdelanto(id: number): Promise<boolean> {
  try {
    const res = await fetch(`/api/tiendas-adelanto?id=${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}
