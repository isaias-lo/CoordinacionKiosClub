import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { derivarPendientesV2, type PendienteDerivada } from '@/features/despacho/rutas/utils/segundaVuelta';

// Pendientes de 2ª vuelta de UN DÍA, derivadas de la FUENTE DE VERDAD: registros de despacho SIN
// patente = no salieron. Carga a mano por día (evita inundar con días viejos que se despacharon sin
// grabar patente). Cubre despacho_rm (RM/Costa → grupo 'rm') Y despacho_regiones (Regiones → 'fal',
// para registrar de vuelta en la tabla correcta). Auto-sanante: al despachar se les pone patente.

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Row { cod: string; fecha: string; tipo: string | null; patente: string | null }

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const fechaISO = request.nextUrl.searchParams.get('fecha') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaISO)) {
      return NextResponse.json({ error: 'Falta ?fecha=YYYY-MM-DD válida' }, { status: 400 });
    }
    const ddmm = fechaISO.split('-').reverse().join('/'); // YYYY-MM-DD → DD/MM/YYYY (formato en despacho_rm)
    const hoy  = todayISO();
    const sb   = supabaseServer();

    const sinPatente = async (table: 'despacho_rm' | 'despacho_regiones') => {
      const { data, error } = await sb
        .from(table)
        .select('cod, fecha, tipo, patente')
        .eq('fecha', ddmm)
        .limit(5000);
      if (error) { console.error(`[segunda-vuelta ${table}]`, error.message); return []; }
      return (data as Row[] ?? [])
        .filter(r => !r.patente || String(r.patente).trim() === '')  // sin patente = no despachada
        .map(r => ({ cod: r.cod, fecha: r.fecha, tipo: r.tipo }));
    };

    const [rmRows, regRows] = await Promise.all([sinPatente('despacho_rm'), sinPatente('despacho_regiones')]);
    const pendientes: PendienteDerivada[] = [
      ...derivarPendientesV2(rmRows, 'rm', hoy),
      ...derivarPendientesV2(regRows, 'fal', hoy),
    ];

    return NextResponse.json({ pendientes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
