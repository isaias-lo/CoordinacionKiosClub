import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';

/**
 * GET /api/pallet-lookup?id=<canonicalId>
 *
 * Busca un registro en despacho_rm primero, luego en despacho_regiones, por el `id`
 * canónico (ej: "P11023 31052026P", "R11123ABC31052026P", etc.). Si no encuentra
 * por id canónico y el parámetro es totalmente numérico, intenta tratarlo como
 * un slot_id numérico y consultar picking_pallets como fallback (compatible con
 * el flujo viejo de Auditoría).
 *
 * Retorna los datos necesarios para pre-cargar el formulario de Recepción/Conductor:
 *   { source, id, cod, tienda, direccion, tipo, carga, conductor, ruta, ventana,
 *     estado, seguimiento, n_pallets, n_bultos, n_contenedores, fecha }
 *
 * `n_pallets/n_bultos/n_contenedores` se calculan agrupando todos los registros
 * de la misma tienda+fecha (el id canónico apunta a un slot puntual, pero la
 * recepción necesita el total agregado de la tienda).
 */

interface DespachoRow {
  id: string;
  fecha: string;
  cod: string;
  tienda: string;
  tipo: string;
  carga?: string | null;
  regimen?: string | null;
  conductor?: string | null;
  ruta?: string | null;
  ventana?: string | null;
  estado?: string | null;
  seguimiento?: string | null;
  n_pallet_bulto?: string | null;
}

type Source = 'despacho_rm' | 'despacho_regiones' | 'picking_pallets';

function normaliseTipo(tipo: string): 'Pallet' | 'Bulto' | 'Contenedor' | 'Otro' {
  const t = (tipo ?? '').toLowerCase();
  if (t.startsWith('pall')) return 'Pallet';
  if (t.startsWith('cont')) return 'Contenedor';
  if (t.startsWith('bul') || t.startsWith('cho')) return 'Bulto';
  return 'Otro';
}

async function aggregateBy(
  sb: ReturnType<typeof supabaseServer>,
  table: 'despacho_rm' | 'despacho_regiones',
  cod: string,
  fecha: string,
): Promise<{ pallets: number; bultos: number; contenedores: number }> {
  const { data } = await sb
    .from(table)
    .select('tipo, n_pallet_bulto')
    .eq('cod', cod)
    .eq('fecha', fecha);
  const rows = (data ?? []) as { tipo: string; n_pallet_bulto: string | null }[];

  // Deduplicar por (tipo, n_pallet_bulto) para evitar contar duplicados
  // que aparecen cuando varias fuentes (Bodega + Enrutador) escriben el mismo
  // pallet real en la tabla.
  const seen = new Set<string>();
  let pallets = 0, bultos = 0, contenedores = 0;
  for (const r of rows) {
    const key = `${r.tipo}__${r.n_pallet_bulto ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const t = normaliseTipo(r.tipo);
    if (t === 'Pallet')      pallets++;
    else if (t === 'Bulto')  bultos++;
    else if (t === 'Contenedor') contenedores++;
  }
  return { pallets, bultos, contenedores };
}

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const id = (request.nextUrl.searchParams.get('id') ?? '').trim();
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const sb = supabaseServer();

  // 1. Try despacho_rm
  let table: Source | null = null;
  let row: DespachoRow | null = null;

  const { data: rm } = await sb
    .from('despacho_rm')
    .select('id, fecha, cod, tienda, tipo, carga, regimen, conductor, ruta, ventana, estado, seguimiento, n_pallet_bulto')
    .eq('id', id)
    .maybeSingle();
  if (rm) { row = rm as DespachoRow; table = 'despacho_rm'; }

  // 2. Try despacho_regiones
  if (!row) {
    const { data: reg } = await sb
      .from('despacho_regiones')
      .select('id, fecha, cod, tienda, tipo, carga, regimen, conductor, ruta, ventana, estado, seguimiento, n_pallet_bulto')
      .eq('id', id)
      .maybeSingle();
    if (reg) { row = reg as DespachoRow; table = 'despacho_regiones'; }
  }

  // 3. Fallback: numeric slot_id → picking_pallets (compat with old workflows)
  if (!row && /^\d+$/.test(id)) {
    const { data: slot } = await sb
      .from('picking_pallets')
      .select('id, store_cod, picker_label, tipo, contenido, refs, created_at')
      .eq('id', Number(id))
      .maybeSingle();
    if (slot) {
      return NextResponse.json({
        data: {
          source: 'picking_pallets' as const,
          id: String(slot.id),
          cod:    (slot as { store_cod?: string }).store_cod ?? '',
          tienda: '',
          direccion: '',
          tipo: (slot as { tipo?: string }).tipo ?? 'P',
          carga: (slot as { contenido?: string }).contenido ?? '',
          conductor: '',
          ruta: '',
          ventana: '',
          estado: 'En picking',
          seguimiento: 'Registrado',
          fecha: ((slot as { created_at?: string }).created_at ?? '').slice(0, 10),
          n_pallets: 0,
          n_bultos: 0,
          n_contenedores: 0,
        },
      });
    }
  }

  if (!row || !table) {
    return NextResponse.json({ error: 'id no encontrado' }, { status: 404 });
  }

  // Aggregate counts per store+fecha to know the totals to recibir
  const totals = await aggregateBy(sb, table, row.cod, row.fecha);

  // Look up address from local store data — same source EstadoPage uses.
  // Note: we keep this server-side string lookup minimal; the client already
  // has the full TIENDAS_INICIAL map for richer formatting.
  return NextResponse.json({
    data: {
      source: table,
      id: row.id,
      cod: row.cod,
      tienda: row.tienda ?? row.cod,
      direccion: '',
      tipo: normaliseTipo(row.tipo),
      carga: row.carga ?? '',
      regimen: row.regimen ?? '',
      conductor: row.conductor ?? '',
      ruta: row.ruta ?? '',
      ventana: row.ventana ?? '',
      estado: row.estado ?? '',
      seguimiento: row.seguimiento ?? '',
      fecha: row.fecha,
      n_pallets:      totals.pallets,
      n_bultos:       totals.bultos,
      n_contenedores: totals.contenedores,
    },
  });
}
