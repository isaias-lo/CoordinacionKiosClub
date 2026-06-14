import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';

const VALID_ESTADOS = new Set(['Registrado', 'Pendiente', 'En camino', 'Entregado', 'Recibido', 'Diferencia']);

function todayFecha(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Convierte DD/MM/YYYY → YYYY-MM-DD para comparar con rutas_despacho.fecha */
function fechaToISO(fecha: string): string {
  const [d, m, y] = fecha.split('/');
  return `${y}-${m}-${d}`;
}

/**
 * Dado el seguimiento más avanzado de todas las tiendas de una ruta,
 * devuelve el estado correspondiente en rutas_despacho.
 * Regla: el estado de la ruta avanza al mínimo (peor estado) del conjunto.
 */
function computeRutaEstado(seguimientos: string[]): string | null {
  const order = ['Registrado', 'Pendiente', 'En camino', 'Entregado', 'Diferencia', 'Recibido'];
  const map: Record<string, string> = {
    Registrado: 'pendiente',
    Pendiente:  'pendiente',
    'En camino': 'en_camino',
    Entregado:  'entregado',
    Diferencia: 'entregado',
    Recibido:   'recibido',
  };
  if (!seguimientos.length) return null;
  // El estado de la ruta = el menos avanzado entre todas sus tiendas
  const minIdx = seguimientos.reduce((minI, seg) => {
    const i = order.indexOf(seg);
    return i < minI ? i : minI;
  }, order.indexOf(seguimientos[0]));
  const minSeg = order[minIdx] ?? seguimientos[0];
  return map[minSeg] ?? null;
}

export async function PATCH(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const { cod, estado, fecha } = await request.json() as { cod: string; estado: string; fecha?: string };

    if (!cod || !VALID_ESTADOS.has(estado)) {
      return NextResponse.json({ error: 'cod y estado requeridos' }, { status: 400 });
    }

    const sb = supabaseServer();
    const fechaFiltro = fecha && fecha.trim().length > 0 ? fecha : todayFecha();

    // 1. Actualizar despacho_rm + despacho_regiones
    await Promise.all([
      sb.from('despacho_rm').update({ seguimiento: estado }).eq('cod', cod).eq('fecha', fechaFiltro),
      sb.from('despacho_regiones').update({ seguimiento: estado }).eq('cod', cod).eq('fecha', fechaFiltro),
    ]);

    // 2. Sincronizar rutas_despacho (fire-and-forget, no bloquea la respuesta)
    ;(async () => {
      try {
        const isoFecha = fechaToISO(fechaFiltro);

        // Encontrar la ruta que contiene esta tienda en esa fecha
        const { data: rt } = await sb
          .from('ruta_tiendas')
          .select('ruta_id')
          .eq('store_cod', cod);

        const rutaIds = [...new Set((rt ?? []).map((r: { ruta_id: number }) => r.ruta_id))];
        if (!rutaIds.length) return;

        // Para cada ruta que incluya esta tienda en esa fecha, recalcular estado
        for (const rutaId of rutaIds) {
          const { data: ruta } = await sb
            .from('rutas_despacho')
            .select('id, fecha')
            .eq('id', rutaId)
            .eq('fecha', isoFecha)
            .maybeSingle();
          if (!ruta) continue;

          // Obtener todas las tiendas de esta ruta y sus seguimientos actuales
          const { data: tiendas } = await sb
            .from('ruta_tiendas')
            .select('store_cod')
            .eq('ruta_id', rutaId);

          const cods = (tiendas ?? []).map((t: { store_cod: string }) => t.store_cod);
          if (!cods.length) continue;

          const [rmRes, regRes] = await Promise.all([
            sb.from('despacho_rm').select('seguimiento').in('cod', cods).eq('fecha', fechaFiltro),
            sb.from('despacho_regiones').select('seguimiento').in('cod', cods).eq('fecha', fechaFiltro),
          ]);

          // Un cod puede estar en rm o regiones; tomamos todos los seguimientos únicos por cod
          const segsMap = new Map<string, string>();
          for (const r of (rmRes.data ?? []) as { seguimiento: string | null }[]) {
            if (r.seguimiento) segsMap.set(r.seguimiento, r.seguimiento);
          }
          for (const r of (regRes.data ?? []) as { seguimiento: string | null }[]) {
            if (r.seguimiento) segsMap.set(r.seguimiento, r.seguimiento);
          }

          const nuevoEstado = computeRutaEstado([...segsMap.values()]);
          if (nuevoEstado) {
            await sb.from('rutas_despacho').update({ estado: nuevoEstado }).eq('id', ruta.id);
          }
        }
      } catch { /* silencioso: sync secundario */ }
    })();

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
