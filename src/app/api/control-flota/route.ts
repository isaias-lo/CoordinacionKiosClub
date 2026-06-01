import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabaseServer } from '@/lib/supabaseServer';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const clean = raw.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  return new google.auth.GoogleAuth({ credentials: JSON.parse(clean), scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
}

function isoToFecha(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ── GET /api/control-flota?fecha=YYYY-MM-DD ────────────────────────────────
export async function GET(request: NextRequest) {
  const fecha = request.nextUrl.searchParams.get('fecha') ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseServer()
    .from('rutas_despacho')
    .select('id, fecha, codigo_ruta, chofer, chofer_original, patente, pioneta_1, pioneta_2, flota_modificada, flota_modificada_at, ruta_tiendas(store_cod, orden, pallets, bultos)')
    .eq('fecha', fecha)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// ── PATCH /api/control-flota ───────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  const body = await request.json() as {
    ruta_id:    number;
    chofer?:    string | null;
    pioneta_1?: string | null;
    pioneta_2?: string | null;
    motivo?:    string;
    changed_by?: string;
  };

  if (!body.ruta_id) return NextResponse.json({ error: 'ruta_id requerido' }, { status: 400 });

  const sb = supabaseServer();

  // 1. Read current state
  const { data: ruta, error: rutaErr } = await sb
    .from('rutas_despacho')
    .select('*, ruta_tiendas(store_cod)')
    .eq('id', body.ruta_id)
    .single();
  if (rutaErr || !ruta) return NextResponse.json({ error: 'Ruta no encontrada' }, { status: 404 });

  // 2. Detect changes (only fields explicitly sent)
  type Change = { campo: string; anterior: string | null; nuevo: string | null };
  const changes: Change[] = [];
  const fields = [
    { campo: 'chofer',    cur: ruta.chofer,    next: body.chofer },
    { campo: 'pioneta_1', cur: ruta.pioneta_1, next: body.pioneta_1 },
    { campo: 'pioneta_2', cur: ruta.pioneta_2, next: body.pioneta_2 },
  ];
  for (const f of fields) {
    if (f.next !== undefined && f.next !== f.cur) {
      changes.push({ campo: f.campo, anterior: f.cur ?? null, nuevo: f.next ?? null });
    }
  }
  if (!changes.length) return NextResponse.json({ ok: true, cambios: 0 });

  const fechaISO = String(ruta.fecha).slice(0, 10);

  // 3. Log to flota_cambios
  await sb.from('flota_cambios').insert(
    changes.map(c => ({
      ruta_id:        body.ruta_id,
      fecha:          fechaISO,
      patente:        ruta.patente,
      campo:          c.campo,
      valor_anterior: c.anterior,
      valor_nuevo:    c.nuevo,
      motivo:         body.motivo ?? null,
      changed_by:     body.changed_by ?? null,
    }))
  );

  // 4. Update rutas_despacho
  const rutaUpd: Record<string, unknown> = { flota_modificada: true, flota_modificada_at: new Date().toISOString() };
  if (body.chofer    !== undefined) {
    rutaUpd.chofer = body.chofer;
    if (!ruta.chofer_original && ruta.chofer) rutaUpd.chofer_original = ruta.chofer;
  }
  if (body.pioneta_1 !== undefined) rutaUpd.pioneta_1 = body.pioneta_1;
  if (body.pioneta_2 !== undefined) rutaUpd.pioneta_2 = body.pioneta_2;

  const { error: updErr } = await sb.from('rutas_despacho').update(rutaUpd).eq('id', body.ruta_id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // 5. Propagate to despacho_rm / despacho_regiones
  const cods = ((ruta.ruta_tiendas as { store_cod: string }[]) ?? []).map(t => t.store_cod).filter(Boolean);
  if (cods.length) {
    const fechaFiltro = isoToFecha(fechaISO);
    const dispUpd: Record<string, unknown> = { conductor_modificado: true, modificado_at: new Date().toISOString() };

    if (body.chofer !== undefined) {
      dispUpd.conductor = body.chofer;
      // Snapshot conductor_original on first change
      const { data: sample } = await sb.from('despacho_rm')
        .select('conductor_original, conductor').in('cod', cods).eq('fecha', fechaFiltro).limit(1).maybeSingle();
      if (sample && !sample.conductor_original && sample.conductor) {
        dispUpd.conductor_original = sample.conductor;
      }
    }
    if (body.pioneta_1 !== undefined) dispUpd.pioneta_1 = body.pioneta_1;
    if (body.pioneta_2 !== undefined) dispUpd.pioneta_2 = body.pioneta_2;

    await Promise.all([
      sb.from('despacho_rm').update(dispUpd).in('cod', cods).eq('fecha', fechaFiltro),
      sb.from('despacho_regiones').update(dispUpd).in('cod', cods).eq('fecha', fechaFiltro),
    ]);
  }

  // 6. Fire-and-forget: append to CAMBIOS FLOTA sheet
  appendCambiosFlota(changes, ruta, body.motivo, body.changed_by).catch(() => {});

  return NextResponse.json({ ok: true, cambios: changes.length });
}

async function appendCambiosFlota(
  changes: { campo: string; anterior: string | null; nuevo: string | null }[],
  ruta: Record<string, unknown>,
  motivo?: string,
  changedBy?: string,
) {
  const auth = getAuth();
  if (!auth) return;
  const gs  = google.sheets({ version: 'v4', auth: await auth });
  const now = new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
  const rows = changes.map(c => [
    String(ruta.fecha ?? ''), String(ruta.patente ?? ''), String(ruta.codigo_ruta ?? ''),
    c.campo, c.anterior ?? '', c.nuevo ?? '', motivo ?? '', changedBy ?? '', now,
  ]);
  await gs.spreadsheets.values.append({
    spreadsheetId:    SPREADSHEET_ID,
    range:            'CAMBIOS FLOTA!A1',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody:      { values: rows },
  });
}
