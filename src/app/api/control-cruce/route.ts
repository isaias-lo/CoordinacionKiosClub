import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';

const TABLE = 'control_cruce_manual';

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { data, error } = await supabaseServer()
    .from(TABLE)
    .select('picking_name, correcta_declaracion, movimiento_ajuste, updated_at, updated_by');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const body = await request.json() as {
    picking_name: string;
    correcta_declaracion?: string;
    movimiento_ajuste?: string;
    updated_by?: string;
  };

  if (!body.picking_name) {
    return NextResponse.json({ error: 'picking_name requerido' }, { status: 400 });
  }

  const { data, error } = await supabaseServer()
    .from(TABLE)
    .upsert({
      picking_name:         body.picking_name,
      correcta_declaracion: body.correcta_declaracion ?? 'PENDIENTE',
      movimiento_ajuste:    body.movimiento_ajuste    ?? '',
      updated_by:           body.updated_by           ?? '',
      updated_at:           new Date().toISOString(),
    }, { onConflict: 'picking_name' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
