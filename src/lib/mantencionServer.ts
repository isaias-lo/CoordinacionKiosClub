// Lo que comparten las rutas de /api/mantencion. Solo servidor: usa el cliente con service role.
//
// ── POR QUÉ LA API Y NO EL NAVEGADOR ──────────────────────────────────────────────────────────
//
// Las tablas `mant_*` tienen RLS con política de LECTURA y ninguna de escritura (ver la cabecera
// de sql/2026-11-19_mantencion_fase1.sql): escribir desde el navegador devuelve error, y es a
// propósito. Toda escritura pasa por acá, que valida antes y deja la bitácora. La lectura también,
// para firmar las URLs de las fotos —el bucket es privado— y para traer foto, comentarios y nombre
// de tienda en una sola respuesta.
//
// Al saltarse el RLS, la API tiene que aplicar la misma regla que él: quien no `veTodo` solo toca
// sus tiendas de `mant_supervisor_tiendas`. Eso es `tiendasDe`, y TODA ruta parte de ahí.

import type { SupabaseClient } from '@supabase/supabase-js';
import { veTodo } from '@/features/mantencion/utils/permisoMantencion';
import { etiquetaZonaDeTienda } from '@/features/mantencion/utils/zonaTienda';
import type { TiendaMant } from '@/features/mantencion/tipos';

export const BUCKET_MANT = 'mantencion-fotos';
/** Las URLs firmadas duran una hora: alcanza para mirar, y una que se reenvía vence sola. */
export const SEGUNDOS_URL_FIRMADA = 3600;

export interface Persona { id: string; role: string; name: string }

/**
 * Las tiendas que esta persona puede ver y para las que puede pedir.
 *
 * Quien `veTodo` (admin, encargado de Mantención) ve todas las activas. El supervisor, las que tiene
 * asignadas en `mant_supervisor_tiendas`, estén activas o no: si tiene una asignada, es suya.
 */
export async function tiendasDe(sb: SupabaseClient, persona: Persona): Promise<TiendaMant[]> {
  let codigos: string[] | null = null;
  if (!veTodo(persona.role)) {
    const { data, error } = await sb
      .from('mant_supervisor_tiendas').select('codigo_tienda').eq('supervisor_id', persona.id);
    if (error) throw new Error(`mant_supervisor_tiendas: ${error.message}`);
    codigos = (data ?? []).map(r => r.codigo_tienda as string);
    if (codigos.length === 0) return [];
  }
  let q = sb.from('tiendas').select('codigo, nombre, sector_comuna, lat').order('codigo');
  q = codigos ? q.in('codigo', codigos) : q.eq('activo', true);
  const { data, error } = await q;
  if (error) throw new Error(`tiendas: ${error.message}`);
  return (data ?? []).map(t => ({
    codigo: t.codigo as string,
    nombre: (t.nombre as string | null)?.trim() || (t.codigo as string),
    zona: etiquetaZonaDeTienda(t.sector_comuna as string | null, t.lat as number | null),
  }));
}

/**
 * Trae TODAS las filas de una consulta, de a mil.
 *
 * PostgREST corta las respuestas en ~1000 filas sin avisar (CLAUDE.md). Las fotos y los
 * comentarios de unas cientos de solicitudes pasan ese número con facilidad.
 */
export async function todasLasFilas<T>(
  pedir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const PAGINA = 1000;
  const out: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await pedir(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGINA) return out;
  }
}

/** Parte una lista de ids en tandas: un `in (...)` con cientos de uuid alarga la URL de más. */
export function enTandas<T>(lista: readonly T[], tamano = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) out.push(lista.slice(i, i + tamano));
  return out;
}

/**
 * Anota cambios en la bitácora de una solicitud (`mant_eventos`).
 *
 * No lanza: lo que se cambió ya se guardó, y perder una línea de registro es menos grave que
 * devolverle un error a quien hizo bien su trabajo. Pero tampoco calla: el error queda en el log.
 */
export async function anotarEventos(
  sb: SupabaseClient,
  persona: Persona,
  solicitudId: string,
  eventos: ReadonlyArray<{ campo: string; anterior: string | null; nuevo: string | null }>,
): Promise<void> {
  if (eventos.length === 0) return;
  const { error } = await sb.from('mant_eventos').insert(eventos.map(e => ({
    solicitud_id: solicitudId, campo: e.campo, valor_anterior: e.anterior, valor_nuevo: e.nuevo,
    usuario_id: persona.id, usuario_nombre: persona.name,
  })));
  if (error) console.error('[mantencion] bitácora', solicitudId, eventos.map(e => e.campo).join(','), error.message);
}
