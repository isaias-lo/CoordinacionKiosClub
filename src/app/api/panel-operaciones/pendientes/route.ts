import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

/**
 * GET /api/panel-operaciones/pendientes?fecha=YYYY-MM-DD
 *
 * Devuelve tiendas que tienen despacho registrado para la fecha indicada
 * (en despacho_rm o despacho_regiones) pero que aún NO tienen ningún
 * registro en `recepcion` (ni conductor ni tienda).
 *
 * Respuesta:
 *  { stores: PendingStore[], total: number }
 */

interface PendingStore {
  cod: string;
  tienda: string;
  source: 'rm' | 'regiones';
  seguimiento: string;
  pallets: number;
  bultos: number;
  contenedores: number;
  conductor?: string | null;
  ventana?: string | null;
  ruta?: string | null;
}

function todayFechaISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Convierte YYYY-MM-DD a DD/MM/YYYY (formato de despacho_rm.fecha) */
function isoToFecha(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export async function GET(request: NextRequest) {
  try {
    const isoFecha = (request.nextUrl.searchParams.get('fecha') ?? todayFechaISO()).slice(0, 10);
    const fechaFiltro = isoToFecha(isoFecha);
    const sb = supabaseServer();

    // 1. Tiendas despachadas hoy (rm + regiones)
    const [rmRes, regRes] = await Promise.all([
      sb.from('despacho_rm')
        .select('cod, tienda, seguimiento, tipo, n_pallet_bulto, conductor, ventana, ruta')
        .eq('fecha', fechaFiltro),
      sb.from('despacho_regiones')
        .select('cod, tienda, seguimiento, tipo, n_pallet_bulto, conductor, ventana, ruta')
        .eq('fecha', fechaFiltro),
    ]);

    const rmRows    = (rmRes.data    ?? []) as { cod: string; tienda: string; seguimiento: string | null; tipo: string; n_pallet_bulto: string | null; conductor: string | null; ventana: string | null; ruta: string | null }[];
    const regRows   = (regRes.data   ?? []) as typeof rmRows;

    // 2. CODs que YA tienen recepción hoy
    const desde = `${isoFecha}T00:00:00`;
    const hasta = `${isoFecha}T23:59:59`;
    const { data: recRows } = await sb
      .from('recepcion')
      .select('cod')
      .gte('created_at', desde)
      .lte('created_at', hasta);

    const receivedCods = new Set((recRows ?? []).map((r: { cod: string }) => r.cod));

    // 3. Agrupar por cod para calcular totales (deduplicar por tipo+n_pallet_bulto)
    function aggregateRows(
      rows: typeof rmRows,
      source: 'rm' | 'regiones',
    ): Map<string, PendingStore> {
      const map = new Map<string, PendingStore>();
      const seen = new Map<string, Set<string>>();

      for (const r of rows) {
        if (receivedCods.has(r.cod)) continue;

        if (!map.has(r.cod)) {
          map.set(r.cod, {
            cod:         r.cod,
            tienda:      r.tienda ?? r.cod,
            source,
            seguimiento: r.seguimiento ?? 'Registrado',
            pallets:     0,
            bultos:      0,
            contenedores: 0,
            conductor:   r.conductor,
            ventana:     r.ventana,
            ruta:        r.ruta,
          });
          seen.set(r.cod, new Set());
        }

        const key = `${r.tipo}__${r.n_pallet_bulto ?? ''}`;
        if (seen.get(r.cod)!.has(key)) continue;
        seen.get(r.cod)!.add(key);

        const store = map.get(r.cod)!;
        const t = (r.tipo ?? '').toLowerCase();
        if (t.startsWith('pall'))      store.pallets++;
        else if (t.startsWith('bul') || t.startsWith('cho')) store.bultos++;
        else if (t.startsWith('cont')) store.contenedores++;
      }
      return map;
    }

    const rmMap  = aggregateRows(rmRows,  'rm');
    const regMap = aggregateRows(regRows, 'regiones');

    // Merge: rm tiene prioridad si mismo cod aparece en ambas tablas
    const merged = new Map<string, PendingStore>([...regMap, ...rmMap]);
    const stores = [...merged.values()].sort((a, b) => a.cod.localeCompare(b.cod));

    return NextResponse.json({ stores, total: stores.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[panel-operaciones/pendientes]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
