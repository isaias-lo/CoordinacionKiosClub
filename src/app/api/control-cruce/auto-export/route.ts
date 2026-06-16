import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';
import { resolveManualFields } from '@/features/control-interno/utils/controlCruceUtils';

// ─── Helpers de timezone Santiago ────────────────────────────────────────────

function santiagoDateParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return {
    year:  get('year'),
    month: get('month'),
    day:   get('day'),
    hour:  parseInt(get('hour'), 10),
    iso:   `${get('year')}-${get('month')}-${get('day')}`,       // YYYY-MM-DD
    tabName: `CRUCE ${get('day')}-${get('month')}-${get('year')}`, // CRUCE DD-MM-YYYY
  };
}

function yesterday(d = new Date()) {
  const prev = new Date(d.getTime() - 86_400_000);
  return santiagoDateParts(prev);
}

// ─── Config helpers ───────────────────────────────────────────────────────────

interface AutoExportConfig {
  hora:         string;
  habilitado:   boolean;
  ultima_fecha: string | null;
}

async function readConfig(sb: ReturnType<typeof supabaseServer>): Promise<AutoExportConfig> {
  const { data } = await sb
    .from('control_cruce_config')
    .select('value')
    .eq('key', 'auto_export')
    .single();
  return (data?.value as AutoExportConfig) ?? { hora: '07:00', habilitado: true, ultima_fecha: null };
}

async function writeConfig(sb: ReturnType<typeof supabaseServer>, config: AutoExportConfig) {
  await sb.from('control_cruce_config').upsert({
    key: 'auto_export',
    value: config,
    updated_at: new Date().toISOString(),
  });
}

// ─── Core export logic ────────────────────────────────────────────────────────

async function runExport(
  baseUrl: string,
  targetDate: { iso: string; tabName: string },
  forwardHeaders: Record<string, string>,
) {
  // 1. Fetch Odoo data (COMPLETADO para fechaArmado = targetDate.iso,
  //    más VENCIDA/PLANIFICADO con scheduled_date en ese rango)
  const odooRes = await fetch(`${baseUrl}/api/odoo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action:            'get_control_activities',
      query:             '',          // todos los usuarios
      dateFrom:          targetDate.iso,
      dateTo:            targetDate.iso,
      incluyePendientes: true,
    }),
  });

  const odooData = (await odooRes.json()) as {
    rows?: Array<{
      pickingName: string; storeCod: string; fechaArmado: string;
      fechaDeclaracion: string | null; responsableArmado: string;
      auditado: string; auditorName: string; detalle: string;
      movAjuste: string; estado: 'COMPLETADO' | 'VENCIDA' | 'PLANIFICADO';
    }>;
    error?: string;
  };

  if (odooData.error) throw new Error(`Odoo: ${odooData.error}`);
  const rawRows = odooData.rows ?? [];

  // 2. Leer overrides manuales de Supabase
  const sb = supabaseServer();
  const { data: manualRows } = await sb
    .from('control_cruce_manual')
    .select('picking_name, correcta_declaracion, movimiento_ajuste');

  const manualMap = new Map<string, { correcta_declaracion: string; movimiento_ajuste: string }>();
  for (const m of manualRows ?? []) {
    manualMap.set(m.picking_name, {
      correcta_declaracion: m.correcta_declaracion,
      movimiento_ajuste:    m.movimiento_ajuste,
    });
  }

  // 3. Aplicar misma lógica que tableData del componente
  const rows = rawRows.map(r => ({
    ...r,
    ...resolveManualFields(r.estado, manualMap.get(r.pickingName)),
  }));

  // 4. Exportar a Sheet con pestaña por fecha
  const exportRes = await fetch(`${baseUrl}/api/control-cruce/export-sheets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...forwardHeaders },
    body: JSON.stringify({
      rows,
      fecha:   new Date().toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }),
      tabName: targetDate.tabName,
    }),
  });

  const exportData = (await exportRes.json()) as {
    ok?: boolean; error?: string; rowsWritten?: number; sheet?: string;
  };
  if (!exportData.ok) throw new Error(`Sheets: ${exportData.error}`);

  return { rowsWritten: exportData.rowsWritten ?? 0, sheet: exportData.sheet ?? targetDate.tabName };
}

// ─── GET — leer config (?action=config) o entrada del Vercel Cron ────────────
// Vercel Cron envía: Authorization: Bearer <CRON_SECRET>
// El browser llama sin auth para leer la config: GET?action=config

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('action') === 'config') {
    const config = await readConfig(supabaseServer());
    return NextResponse.json({ config });
  }

  const cronSecret = process.env.CRON_SECRET ?? '';
  const authHeader = req.headers.get('authorization') ?? '';
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb     = supabaseServer();
  const config = await readConfig(sb);

  if (!config.habilitado) {
    return NextResponse.json({ skipped: 'disabled' });
  }

  const now         = santiagoDateParts();
  const configHour  = parseInt(config.hora.split(':')[0], 10);

  if (now.hour !== configHour) {
    return NextResponse.json({ skipped: 'not time yet', currentHour: now.hour, configHour });
  }

  // Exportar el día ANTERIOR (al llegar las 7am de hoy, el día de ayer está completo)
  const ayer = yesterday();

  if (config.ultima_fecha === ayer.iso) {
    return NextResponse.json({ skipped: 'already exported today', date: ayer.iso });
  }

  const baseUrl = new URL(req.url).origin;

  try {
    const result = await runExport(baseUrl, ayer, { authorization: authHeader });
    await writeConfig(sb, { ...config, ultima_fecha: ayer.iso });
    return NextResponse.json({ ok: true, ...result, date: ayer.iso });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST — forzar exportación desde la UI ────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await verifyAuth(req))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let body: { fecha?: string } = {};
  try { body = await req.json(); } catch { /* sin body */ }

  // Si viene fecha explícita (YYYY-MM-DD) se usa esa; si no, ayer.
  const targetDate = body.fecha
    ? (() => {
        const [y, m, d] = (body.fecha as string).split('-');
        const iso = `${y}-${m}-${d}`;
        return { iso, tabName: `CRUCE ${d}-${m}-${y}` };
      })()
    : yesterday();

  const baseUrl = new URL(req.url).origin;
  const forwardHeaders: Record<string, string> = {};
  const incomingAuth   = req.headers.get('authorization');
  const incomingCookie = req.headers.get('cookie');
  if (incomingAuth)   forwardHeaders.authorization = incomingAuth;
  if (incomingCookie) forwardHeaders.cookie         = incomingCookie;
  try {
    const result = await runExport(baseUrl, targetDate, forwardHeaders);
    // Actualizar ultima_fecha si es "ayer"
    const ayer = yesterday();
    if (targetDate.iso === ayer.iso) {
      const sb = supabaseServer();
      const config = await readConfig(sb);
      await writeConfig(sb, { ...config, ultima_fecha: ayer.iso });
    }
    return NextResponse.json({ ok: true, ...result, date: targetDate.iso });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PATCH — actualizar configuración desde la UI ─────────────────────────────

export async function PATCH(req: NextRequest) {
  if (!(await verifyAuth(req))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let body: Partial<AutoExportConfig> = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const sb     = supabaseServer();
  const config = await readConfig(sb);
  const updated: AutoExportConfig = {
    hora:         body.hora         ?? config.hora,
    habilitado:   body.habilitado   ?? config.habilitado,
    ultima_fecha: config.ultima_fecha,
  };

  await writeConfig(sb, updated);
  return NextResponse.json({ ok: true, config: updated });
}

// ─── GET /config — leer config actual (query param ?action=config) ─────────────
// Se accede vía GET?action=config desde el componente para leer estado inicial.
// El mismo handler GET maneja esto antes de verificar CRON_SECRET.
