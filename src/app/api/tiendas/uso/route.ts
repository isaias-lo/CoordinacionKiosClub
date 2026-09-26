import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAdmin } from '@/lib/apiAuth';
import { normalizeCod } from '../sync/normalizeCod';

// [P3] ¿Esta tienda tiene historial? Se consulta ANTES de ofrecer borrarla.
//
// Borrar una tienda con despachos, picking o manifiestos dejaría filas huérfanas: el código sigue
// escrito en `despacho_rm`/`despacho_regiones`, `picking_pallets` y `ruta_tiendas`, pero ya no se
// podría resolver su nombre ni sus datos. Por eso el borrado real se permite SOLO si está limpia
// (típicamente una tienda recién creada por error, como la 59EGÑ); si tiene uso, la UI ofrece
// desactivarla, que es reversible y no rompe nada.

/** Cuenta filas sin traerlas (head + count exacto). Devuelve 0 si la tabla falla. */
async function contar(
  sb: ReturnType<typeof supabaseServer>,
  tabla: string,
  columna: string,
  cod: string,
): Promise<number> {
  const { count, error } = await sb
    .from(tabla)
    .select(columna, { count: 'exact', head: true })
    .eq(columna, cod);
  if (error) { console.error(`[tiendas/uso] ${tabla}:`, error.message); return 0; }
  return count ?? 0;
}

/** Los códigos que aparecen dentro del calendario (un jsonb, no se puede consultar con `eq`). */
async function leerCalendario(sb: ReturnType<typeof supabaseServer>): Promise<string> {
  try {
    const { data } = await sb.from('calendario_central').select('data').eq('id', 'current').maybeSingle();
    return JSON.stringify(data?.data ?? {});
  } catch (e) {
    console.error('[tiendas/uso] calendario:', e);
    return '';
  }
}

/** El uso de todas las tiendas de una sola vez: `{ "59EGÑ": { total, puedeEliminar }, … }`. */
async function todasLasTiendas(sb: ReturnType<typeof supabaseServer>) {
  const { data, error } = await sb.rpc('uso_por_tienda');
  if (error) {
    console.error('[tiendas/uso] rpc:', error.message);
    return NextResponse.json({ error: 'No se pudo calcular el uso' }, { status: 500 });
  }
  const cal = await leerCalendario(sb);
  const filas = (data ?? []) as { codigo: string; total: number }[];
  const porTienda: Record<string, { total: number; enCalendario: boolean; puedeEliminar: boolean }> = {};
  for (const f of filas) {
    const total = Number(f.total) || 0;
    const enCalendario = cal.includes(`"${f.codigo}"`);
    porTienda[f.codigo] = { total, enCalendario, puedeEliminar: total === 0 && !enCalendario };
  }
  return NextResponse.json({ porTienda });
}

export async function GET(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const sb = supabaseServer();
  const cod = normalizeCod(request.nextUrl.searchParams.get('codigo') ?? '');

  // Sin `codigo` → el uso de TODAS las tiendas, para la columna USO de la tabla.
  //
  // Va por una función SQL (`uso_por_tienda`) y no leyendo las tablas: PostgREST corta en ~1000
  // filas sin avisar y `despacho_rm` tiene miles, así que contar acá daría números falsos — y sobre
  // ese número se decide si una tienda se puede borrar.
  if (!cod) return todasLasTiendas(sb);
  const [picking, rm, regiones, rutas, sesion] = await Promise.all([
    contar(sb, 'picking_pallets',    'store_cod', cod),
    contar(sb, 'despacho_rm',        'cod',       cod),
    contar(sb, 'despacho_regiones',  'cod',       cod),
    contar(sb, 'ruta_tiendas',       'store_cod', cod),
    contar(sb, 'despacho_sesion',    'tienda_cod', cod),
  ]);

  const enCalendario = (await leerCalendario(sb)).includes(`"${cod}"`);

  const usos = { picking, despacho_rm: rm, despacho_regiones: regiones, manifiestos: rutas, sesion };
  const total = picking + rm + regiones + rutas + sesion;

  return NextResponse.json({
    codigo: cod,
    usos,
    enCalendario,
    total,
    // Solo se puede borrar de verdad si no dejó rastro en ningún lado.
    puedeEliminar: total === 0 && !enCalendario,
  });
}
