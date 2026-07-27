import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { checkRateLimit, getClientIp, tooManyRequests } from '@/lib/rateLimit';
import { normalizeCod } from '../sync/normalizeCod';
import { ALIAS } from '@/features/despacho/rutas/data/tiendas';

/**
 * GET /api/tiendas/public?cod=XXX — lectura PÚBLICA (sin auth) de UNA tienda por código.
 * Sirve a la página de recepción por QR (pública) para que una tienda creada en Config
 * (solo en la BD) también funcione, sin depender del catálogo estático.
 *
 * Seguridad: select ACOTADO — NUNCA devuelve correos/teléfonos/supervisor (PII/operativo).
 * El correo se sigue usando solo server-side en /api/recepcion-otp. Rate-limit + 404 genérico.
 */
export async function GET(request: NextRequest) {
  if (!checkRateLimit(`tienda-public:${getClientIp(request)}`, { max: 60, windowMs: 600_000 }))
    return tooManyRequests();

  const raw = new URL(request.url).searchParams.get('cod') ?? '';
  const norm = normalizeCod(raw);
  const cod  = ALIAS[norm] ?? norm; // resuelve alias corto/legacy → canónico
  if (!cod) return NextResponse.json({ error: 'cod requerido' }, { status: 400 });

  const { data } = await supabaseServer()
    .from('tiendas')
    .select('codigo, nombre, direccion, region, sector_comuna, ventana, activo, lat, lon')
    .eq('codigo', cod)
    .maybeSingle();

  // 404 genérico (no revela si existe pero está inactiva)
  if (!data || data.activo === false) {
    return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 });
  }

  return NextResponse.json({ tienda: data });
}
