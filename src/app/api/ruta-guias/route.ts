import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { norm } from '@/features/despacho/rutas/utils/helpers';
import { fechaChile } from '@/lib/fechaChile';
import { elegirRuta, type RutaCandidata } from '@/lib/rutaGuiaMatch';

// Ventana de días (±) alrededor de hoy en que buscamos un manifiesto para la guía.
// Cubre el caso "armado hoy / sale mañana" y subidas al día siguiente.
const VENTANA_DIAS = 1;

// Extrae el path dentro del bucket `guides` desde la URL pública de Storage
// (.../storage/v1/object/public/guides/<path>). Devuelve null para URLs legado (fileId de Drive).
function storagePathFromGuideUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/storage\/v1\/object\/public\/guides\/(.+)$/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

// Vincula automáticamente las guías DTE subidas en bodega (Estado / Santiago /
// Regiones) a la ruta de despacho que contiene esa tienda. Match robusto:
// código normalizado + ventana de fecha local de Chile (no UTC).
export async function POST(request: NextRequest) {
  const body = await request.json() as {
    store_cod: string;
    fecha?: string;
    folios: string[];
    drive_url?: string;
  };

  const codNorm = norm(body.store_cod);
  const desde = fechaChile(-VENTANA_DIAS);
  const hasta = fechaChile(VENTANA_DIAS);

  // Persistir SIEMPRE la subida (aunque aún no exista manifiesto): así, cuando el
  // Enrutador cree el manifiesto, podrá "jalar" estas guías. Reemplaza la del día
  // para esta tienda si re-sube.
  if (body.folios?.length) {
    const sbg = supabaseServer();
    const hoy = fechaChile(0);

    // Capturar el/los PDF(s) reemplazados para borrarlos del Storage: cada re-subida
    // sube un archivo nuevo (nombre con Date.now()) y el anterior quedaba huérfano,
    // inflando la cuota de Storage con copias que ya nadie referencia.
    const { data: reemplazadas } = await sbg
      .from('guias_subidas')
      .select('drive_url')
      .eq('store_cod', codNorm)
      .eq('fecha', hoy);

    await sbg.from('guias_subidas').delete().eq('store_cod', codNorm).eq('fecha', hoy);
    await sbg.from('guias_subidas').insert({
      store_cod: codNorm, folios: body.folios, drive_url: body.drive_url ?? null, fecha: hoy,
    });

    const paths = (reemplazadas ?? [])
      .map(r => storagePathFromGuideUrl(r.drive_url))
      .filter((p): p is string => !!p && p !== storagePathFromGuideUrl(body.drive_url));
    if (paths.length) await sbg.storage.from('guides').remove(paths);
  }

  // Buscar rutas que tengan esta tienda dentro de la ventana de fechas
  const { data: tiendaRows, error: tErr } = await supabaseServer()
    .from('ruta_tiendas')
    .select('ruta_id, rutas_despacho!inner(fecha, estado)')
    .eq('store_cod', codNorm)
    .gte('rutas_despacho.fecha', desde)
    .lte('rutas_despacho.fecha', hasta);

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  const candidatas: RutaCandidata[] = (tiendaRows ?? []).map(r => {
    const rd = (r as { rutas_despacho: { fecha: string; estado: string } | { fecha: string; estado: string }[] }).rutas_despacho;
    const meta = Array.isArray(rd) ? rd[0] : rd;
    return { ruta_id: (r as { ruta_id: number }).ruta_id, fecha: meta?.fecha ?? '', estado: meta?.estado ?? '' };
  });

  const rutaId = elegirRuta(candidatas);
  if (rutaId === null) {
    // No hay manifiesto para esta tienda en la ventana — el cliente avisa al usuario
    return NextResponse.json({ ok: true, linked: 0, reason: 'sin_manifiesto', store_cod: codNorm });
  }

  // Borrar guías previas de esta tienda en esta ruta (para reemplazar si re-sube)
  await supabaseServer()
    .from('ruta_guias')
    .delete()
    .eq('ruta_id', rutaId)
    .eq('store_cod', codNorm);

  // Insertar una fila por folio
  const rows = body.folios.map(folio => ({
    ruta_id:   rutaId,
    store_cod: codNorm,
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
      datos:   { store_cod: codNorm, folios: body.folios, drive_url: body.drive_url },
    });

  return NextResponse.json({ ok: true, linked: rows.length, ruta_id: rutaId });
}
