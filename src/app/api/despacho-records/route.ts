import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

const ALLOWED_TABLES = new Set(['despacho_rm', 'despacho_regiones', 'recepcion']);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table') ?? '';

  if (!ALLOWED_TABLES.has(table)) {
    return NextResponse.json({ error: 'tabla no permitida' }, { status: 400 });
  }

  const sb = supabaseServer();
  const { data, error } = await sb
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

/**
 * POST /api/despacho-records
 * Body: { table: 'despacho_rm' | 'despacho_regiones', records: object[] }
 *
 * Upserts records directamente en Supabase.
 * Se usa para escribir registros RM en el mismo momento del despacho
 * (con seguimiento = 'En camino'), evitando la race condition de
 * escribir a Sheets primero y esperar la sincronización.
 *
 * La política de conflicto: si el registro ya existe (mismo id) Y su
 * seguimiento actual es un estado avanzado ('Entregado','Recibido','Diferencia'),
 * el campo seguimiento no se sobreescribe. Para el resto de campos sí.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { table?: string; records?: object[] };
    const { table = '', records = [] } = body;

    if (!ALLOWED_TABLES.has(table)) {
      return NextResponse.json({ error: 'tabla no permitida' }, { status: 400 });
    }
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'records vacío' }, { status: 400 });
    }

    const sb = supabaseServer();

    // Separar registros en dos grupos: nuevos vs existentes
    // Usamos upsert con ignoreDuplicates=false para que los registros
    // ya existentes con estados intermedios (Registrado, Pendiente)
    // se actualicen a 'En camino', pero sin tocar los que ya están
    // en estados finales.
    const ids = (records as { id?: string }[]).map(r => r.id).filter(Boolean) as string[];

    // 1. Obtener los que ya existen y están en estado final
    const { data: existentes } = await sb
      .from(table)
      .select('id, seguimiento')
      .in('id', ids);

    const estadosFinales = new Set(['Entregado', 'Recibido', 'Diferencia']);
    const idsProtegidos = new Set(
      ((existentes ?? []) as { id: string; seguimiento: string }[])
        .filter(r => estadosFinales.has(r.seguimiento))
        .map(r => r.id)
    );

    // 2. Upsert solo los registros que no están en estado final
    const recordsToUpsert = (records as { id?: string }[]).filter(r => !idsProtegidos.has(r.id ?? ''));
    if (recordsToUpsert.length === 0) {
      return NextResponse.json({ ok: true, upserted: 0, skipped: ids.length });
    }

    const { error } = await sb
      .from(table)
      .upsert(recordsToUpsert, { onConflict: 'id' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, upserted: recordsToUpsert.length, skipped: idsProtegidos.size });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
