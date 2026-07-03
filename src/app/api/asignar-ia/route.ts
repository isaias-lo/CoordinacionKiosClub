import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { fetchAsignacionHistory } from '@/features/despacho/rutas/ia/historyFetcher';
import { IA_SYSTEM_PROMPT, buildAsignacionUserPrompt } from '@/features/despacho/rutas/ia/promptBuilder';
import { parseProposal } from '@/features/despacho/rutas/ia/parseProposal';
import type { IAStore, IATruck } from '@/features/despacho/rutas/ia/types';

export const maxDuration = 30;

// Modelo configurable por env; por defecto Sonnet (rápido/económico para esta tarea).
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

export async function POST(request: NextRequest) {
  if (!await verifyAuth(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada en el servidor' }, { status: 503 });
  }

  try {
    const body   = await request.json() as { fecha?: string; stores?: IAStore[]; trucks?: IATruck[] };
    const stores = Array.isArray(body.stores) ? body.stores : [];
    const trucks = Array.isArray(body.trucks) ? body.trucks : [];
    if (!stores.length) return NextResponse.json({ error: 'Sin tiendas para asignar' }, { status: 400 });
    if (!trucks.length) return NextResponse.json({ error: 'Sin camiones disponibles' }, { status: 400 });

    // Aprendizaje in-context: asignaciones reales de días previos.
    const sb = supabaseServer();
    const examples = await fetchAsignacionHistory(
      sb as unknown as Parameters<typeof fetchAsignacionHistory>[0],
      { excludeFecha: body.fecha, limit: 15 },
    );

    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 2048,
      system:     IA_SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: buildAsignacionUserPrompt({ stores, trucks, examples }) }],
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
