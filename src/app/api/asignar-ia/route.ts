import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { fetchAsignacionHistory } from '@/features/despacho/rutas/ia/historyFetcher';
import { IA_SYSTEM_PROMPT, buildAsignacionUserPrompt } from '@/features/despacho/rutas/ia/promptBuilder';
import { parseProposal } from '@/features/despacho/rutas/ia/parseProposal';
import type { IAStore, IATruck } from '@/features/despacho/rutas/ia/types';

// 60s: la llamada real de ruteo (prompt grande + ejemplos de historial + hasta 2048 tokens de
// salida) puede tardar bastante más que la mínima. Con 30s Vercel mataba la función a mitad y el
// cliente recibía un 504 sin JSON → "La IA no respondió" sin causa visible. El ping mínimo sí cabía.
export const maxDuration = 60;

// Modelo configurable por env. Default: Sonnet — mejor razonamiento para balancear carga entre
// camiones e inferir los patrones del coordinador (Haiku dejaba camiones grandes casi vacíos).
// Para abaratar: ANTHROPIC_MODEL=claude-haiku-4-5-20251001.
// OJO: el ID debe existir/estar vigente; un modelo retirado (ej. el viejo 'claude-sonnet-4-6')
// hace fallar la llamada → el enrutador cae al optimizador GPS ("La IA no respondió").
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

// Diagnóstico (sin logs de Vercel a mano): abre /api/asignar-ia en el navegador (con sesión) para
// ver si la key está puesta y qué modelo usa. Con /api/asignar-ia?ping=1 hace una llamada mínima a
// Anthropic y devuelve el error EXACTO si el modelo/crédito/red fallan — así se ve la causa real de
// "La IA no respondió" sin exponer el secreto (nunca se devuelve la key, solo si está presente).
export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const base = { configurada: !!apiKey, model: MODEL, modelPorEnv: !!process.env.ANTHROPIC_MODEL };
  const ping = request.nextUrl.searchParams.get('ping');
  if (ping !== '1' || !apiKey) return NextResponse.json(base);
  try {
    const anthropic = new Anthropic({ apiKey, timeout: 15_000, maxRetries: 0 });
    const msg = await anthropic.messages.create({
      model: MODEL, max_tokens: 8,
      messages: [{ role: 'user', content: 'Responde solo con: OK' }],
    });
    const txt = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('').trim();
    return NextResponse.json({ ...base, ping: 'ok', respuesta: txt });
  } catch (err) {
    const detalle = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ ...base, ping: 'error', detalle });
  }
}

export async function POST(request: NextRequest) {
  if (!await verifyAuth(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada en el servidor' }, { status: 503 });
  }

  try {
    const body   = await request.json() as { fecha?: string; stores?: IAStore[]; trucks?: IATruck[]; gpsRef?: Record<string, string[]> };
    const stores = Array.isArray(body.stores) ? body.stores : [];
    const trucks = Array.isArray(body.trucks) ? body.trucks : [];
    const gpsRef = body.gpsRef && typeof body.gpsRef === 'object' && !Array.isArray(body.gpsRef) ? body.gpsRef : undefined;
    if (!stores.length) return NextResponse.json({ error: 'Sin tiendas para asignar' }, { status: 400 });
    if (!trucks.length) return NextResponse.json({ error: 'Sin camiones disponibles' }, { status: 400 });

    // Aprendizaje in-context: asignaciones reales de días previos.
    const sb = supabaseServer();
    const examples = await fetchAsignacionHistory(
      sb as unknown as Parameters<typeof fetchAsignacionHistory>[0],
      { excludeFecha: body.fecha, limit: 15 },
    );

    // timeout < maxDuration (60s) para fallar limpio DENTRO del presupuesto de la función y devolver
    // un 502 con mensaje ("Request timed out") en vez del 504 mudo de Vercel. Sin reintentos: un
    // reintento duplicaría la latencia y volvería a chocar contra el límite.
    const anthropic = new Anthropic({ apiKey, timeout: 50_000, maxRetries: 0 });
    const msg = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 2048,
      system:     IA_SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: buildAsignacionUserPrompt({ stores, trucks, examples, gpsRef }) }],
    });

    const raw = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    const { asignaciones, warnings } = parseProposal(raw, stores, trucks);

    return NextResponse.json({ ok: true, asignaciones, warnings, model: MODEL, ejemplos: examples.length });
  } catch (err) {
    console.error('[asignar-ia]', err);
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: `Asistente IA no disponible: ${msg}` }, { status: 502 });
  }
}
