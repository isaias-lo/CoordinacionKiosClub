import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';
import { parseZonas, ZONAS_DEFAULT, type ConfigZonas } from '@/features/despacho/rutas/utils/zonasTransporte';

// [E8] GET/PATCH /api/zonas-transporte
//
// Qué empresa transporta cada zona y si se rutea o se consolida. Existe porque eso CAMBIA:
// Luis Fica está tomando el sur que hacía Falabella, y más adelante tomaría el norte. Antes
// el motor lo deducía del historial, que está a mitad del traspaso y por definición atrasado.
//
// Con esto, mover una zona de un transportista a otro es un PATCH, no un deploy.

let cache: { at: number; data: ConfigZonas } | null = null;
const TTL_MS = 60 * 1000;
// Un minuto, no una hora. El caché es por instancia de lambda, así que un PATCH solo invalida
// el de la instancia que lo atendió: el TTL es el techo real de cuánto puede tardar un cambio
// de transportista en verse. Son 4 filas — releerlas cada minuto no se nota.

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const force = request.nextUrl.searchParams.get('refresh') === '1';
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ data: cache.data, cached: true });
  }
  try {
    const { data, error } = await supabaseServer().from('zonas_transporte').select('*');
    // Si la tabla todavía no existe, el motor tiene que poder rutear igual: se devuelve el
    // default en vez de un 500. Es la diferencia entre "hoy no se puede despachar" y "hoy se
    // despacha con la configuración de ayer".
    if (error) return NextResponse.json({ data: ZONAS_DEFAULT, fallback: true, detalle: error.message });
    const cfg = parseZonas(data);
    cache = { at: Date.now(), data: cfg };
    return NextResponse.json({ data: cfg });
  } catch (err) {
    return NextResponse.json({ data: ZONAS_DEFAULT, fallback: true, detalle: String(err) });
  }
}

export async function PATCH(request: NextRequest) {
  if (!await verifyAuth(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const body = await request.json() as { zona?: string; modo?: string; empresas?: unknown; activo?: boolean };
    const zona = String(body.zona ?? '').trim().toLowerCase();
    if (!['santiago', 'costa', 'sur', 'norte'].includes(zona)) {
      return NextResponse.json({ error: 'Zona inválida' }, { status: 400 });
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.modo === 'ruta' || body.modo === 'consolidacion') patch.modo = body.modo;
    if (Array.isArray(body.empresas)) patch.empresas = body.empresas.map(e => String(e).trim()).filter(Boolean);
    if (typeof body.activo === 'boolean') patch.activo = body.activo;

    const { data, error } = await supabaseServer()
      .from('zonas_transporte').update(patch).eq('zona', zona).select('zona');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Sin el .select() esto devolvía ok:true aunque no se hubiera modificado ninguna fila —
    // pasa si falta la fila, o si SUPABASE_SERVICE_ROLE_KEY no está y el cliente cae a la anon
    // key, que RLS bloquea sin error. Decir "guardado" sin haber guardado es el peor resultado
    // posible para un traspaso de transportista.
    if (!data?.length) {
      return NextResponse.json(
        { error: `No se modificó la zona "${zona}". ¿Está creada la tabla zonas_transporte y tiene esa fila?` },
        { status: 409 },
      );
    }
    cache = null;   // el próximo GET relee
    return NextResponse.json({ ok: true, zona });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
