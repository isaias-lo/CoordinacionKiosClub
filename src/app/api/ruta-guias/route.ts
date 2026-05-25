import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

// Vincula automáticamente las guías DTE subidas en Estado/Seguimiento
// a la ruta de despacho del día que contiene esa tienda.
export async function POST(request: NextRequest) {
  const body = await request.json() as {
    store_cod: string;
    fecha: string;
    folios: string[];
    drive_url?: string;
  };

  // Buscar la ruta del día que tenga esta tienda
  const { data: tiendaRows, error: tErr } = await supabaseServer()
    .from('ruta_tiendas')
    .select('ruta_id, rutas_despacho!inner(fecha)')
    .eq('store_cod', body.store_cod)
    .eq('rutas_despacho.fecha', body.fecha);

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!tiendaRows?.length) {
    // No hay ruta registrada para esta tienda hoy — OK, no es error
    return NextResponse.json({ ok: true, linked: 0 });
  }

  const rutaId = (tiendaRows[0] as { ruta_id: number }).ruta_id;

  // Borrar guías previas de esta tienda en esta ruta (para reemplazar si re-sube)
  await supabaseServer()
    .from('ruta_guias')
    .delete()
    .eq('ruta_id', rutaId)
    .eq('store_cod', body.store_cod);

  // Insertar una fila por folio
  const rows = body.folios.map(folio => ({
    ruta_id:   rutaId,
    store_cod: body.store_cod,
    folio_dte: folio,
    drive_url: body.drive_url ?? null,
    tipo:      'original',
  }));

  const { error: gErr } = await supabaseServer()
    .from('ruta_guias')
    .insert(rows);

  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });

  // Registrar evento de trazabilidad
  await supabaseServer()
    .from('ruta_eventos')
    .insert({
      ruta_id: rutaId,
      tipo:    'entrega',
      datos:   { store_cod: body.store_cod, folios: body.folios, drive_url: body.drive_url },
    });

  return NextResponse.json({ ok: true, linked: rows.length, ruta_id: rutaId });
}
