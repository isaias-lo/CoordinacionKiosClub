import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import type { Vehiculo } from '@/features/despacho/rutas/data/flota';

// ── Row shape from flota_vehiculos table ───────────────────────────────────
interface FlotaRow {
  patente: string;
  capacidad_p: number;
  capacidad_b: number;
  tipo: string;
  porton: boolean | null;
  refrigerado: boolean;
  activo: boolean;
  es_tlbd: boolean;
  empresa: string;
}

function rowToVehiculo(row: FlotaRow): Vehiculo {
  return {
    p:          row.patente,
    c:          row.capacidad_p,
    b:          row.capacidad_b,
    t:          row.tipo,
    porton:     row.porton,
    refrigerado:row.refrigerado,
    on:         row.activo,
    tlbd:       row.es_tlbd,
    empresa:    row.empresa ?? '',
  };
}

function vehiculoToRow(v: Vehiculo): Omit<FlotaRow, never> {
  return {
    patente:     v.p,
    capacidad_p: v.c,
    capacidad_b: v.b,
    tipo:        v.t,
    porton:      v.porton ?? null,
    refrigerado: v.refrigerado,
    activo:      v.on,
    es_tlbd:     v.tlbd,
    empresa:     v.empresa ?? '',
  };
}

// ── GET /api/flota  →  lista todos los vehículos activos ──────────────────
export async function GET() {
  const { data, error } = await supabaseServer()
    .from('flota_vehiculos')
    .select('patente,capacidad_p,capacidad_b,tipo,porton,refrigerado,activo,es_tlbd,empresa')
    .eq('activo', true)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const flota: Vehiculo[] = (data as FlotaRow[]).map(rowToVehiculo);
  return NextResponse.json({ flota });
}

// ── POST /api/flota  →  inserta un nuevo vehículo ─────────────────────────
export async function POST(request: NextRequest) {
  const body = await request.json() as Vehiculo;
  if (!body.p) return NextResponse.json({ error: 'patente requerida' }, { status: 400 });

  const row = vehiculoToRow(body);
  const sb = supabaseServer();
  const { error } = await sb.from('flota_vehiculos').insert(row);

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ya existe', code: 'DUPLICATE' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ── PATCH /api/flota  →  actualiza un vehículo por patente ───────────────
export async function PATCH(request: NextRequest) {
  const body = await request.json() as Partial<Vehiculo> & { p: string };
  if (!body.p) return NextResponse.json({ error: 'patente requerida' }, { status: 400 });

  // Build only the fields that were sent
  const updates: Partial<FlotaRow> = {};
  if (body.c           !== undefined) updates.capacidad_p  = body.c;
  if (body.b           !== undefined) updates.capacidad_b  = body.b;
  if (body.t           !== undefined) updates.tipo         = body.t;
  if (body.porton      !== undefined) updates.porton       = body.porton;
  if (body.refrigerado !== undefined) updates.refrigerado  = body.refrigerado;
  if (body.on          !== undefined) updates.activo       = body.on;
  if (body.tlbd        !== undefined) updates.es_tlbd      = body.tlbd;
  if (body.empresa     !== undefined) updates.empresa      = body.empresa;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, cambios: 0 });
  }

  const { error } = await supabaseServer().from('flota_vehiculos').update(updates).eq('patente', body.p);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// ── DELETE /api/flota?patente=X  →  soft delete (activo=false) ───────────
export async function DELETE(request: NextRequest) {
  const patente = request.nextUrl.searchParams.get('patente');
  if (!patente) return NextResponse.json({ error: 'patente requerida' }, { status: 400 });

  const { error } = await supabaseServer()
    .from('flota_vehiculos')
    .update({ activo: false })
    .eq('patente', patente);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
