// Leer las filas de despacho (despacho_rm + despacho_regiones) sin que Supabase las recorte.
//
// Existe por C-01: las tarjetas de Inicio decían "26 pallets · 0 bultos · 0 chocolates" para un día
// en que Bodega había registrado 61, 38 y 52. La causa son dos cosas que se potencian:
//
//  1. **PostgREST corta cada respuesta en ~1000 filas.** `.limit(50000)` no la levanta: pide 50.000
//     y recibe 1.000. Hay que paginar con `.range()`, que es lo que ya hacía el endpoint del
//     gráfico — su comentario lo dice, pero el de las tarjetas no lo hacía.
//  2. **`order('id')` sobre un id de TEXTO ordena alfabéticamente, no por fecha.** Los ids son
//     `P1…`, `CH1…`, `1B…`, y en ASCII las letras van por delante de los dígitos. Así que ese
//     recorte de 1.000 filas no traía "las más recientes": traía **las que empiezan con P**. Por eso
//     desaparecían categorías enteras — los bultos, cuyo id empieza con número, quedaban siempre
//     fuera, y no faltaba un poco de cada cosa sino todo de algunas.
//
// Por eso acá se ordena por `created_at` (que sí es cronológico) y se pagina hasta traer todo.

import type { SupabaseClient } from '@supabase/supabase-js';

export type FilaDespacho = { fecha: string; tipo: string };

/** Las dos tablas del registro de despacho. */
export const TABLAS_DESPACHO = ['despacho_rm', 'despacho_regiones'] as const;

const PAGINA = 1000;

/**
 * Trae `{fecha, tipo}` de una tabla, desde `desde` (ISO de `created_at`), paginando.
 * `maxFilas` es un tope de seguridad: si se alcanza, se devuelve lo que haya.
 */
export async function filasDeTabla(
  sb: SupabaseClient, tabla: string, desde: string, maxFilas = 12000,
): Promise<FilaDespacho[]> {
  const filas: FilaDespacho[] = [];
  for (let from = 0; from < maxFilas; from += PAGINA) {
    const { data, error } = await sb.from(tabla)
      .select('fecha, tipo')
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .range(from, from + PAGINA - 1);
    if (error) throw error;
    const lote = (data ?? []) as FilaDespacho[];
    filas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return filas;
}

/** Las filas de las DOS tablas juntas. Una sola fuente para el gráfico y para las tarjetas. */
export async function filasDeDespacho(
  sb: SupabaseClient, desde: string, maxFilas = 12000,
): Promise<FilaDespacho[]> {
  const porTabla = await Promise.all(
    TABLAS_DESPACHO.map(t => filasDeTabla(sb, t, desde, maxFilas)),
  );
  return porTabla.flat();
}
