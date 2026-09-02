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

export async function GET(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const cod = normalizeCod(request.nextUrl.searchParams.get('codigo') ?? '');
  if (!cod) return NextResponse.json({ error: 'codigo requerido' }, { status: 400 });

  const sb = supabaseServer();
  const [picking, rm, regiones, rutas, sesion] = await Promise.all([
    contar(sb, 'picking_pallets',    'store_cod', cod),
    contar(sb, 'despacho_rm',        'cod',       cod),
    contar(sb, 'despacho_regiones',  'cod',       cod),
    contar(sb, 'ruta_tiendas',       'store_cod', cod),
    contar(sb, 'despacho_sesion',    'tienda_cod', cod),
  ]);

  // El calendario es un jsonb (día → grupo → [códigos]); no se puede contar con `eq`.
  let enCalendario = false;
  try {
    const { data } = await sb.from('calendario_central').select('data').eq('id', 'current').maybeSingle();
    enCalendario = JSON.stringify(data?.data ?? {}).includes(`"${cod}"`);
  } catch (e) { console.error('[tiendas/uso] calendario:', e); }

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
