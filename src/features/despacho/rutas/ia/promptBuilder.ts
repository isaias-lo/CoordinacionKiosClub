// Construye el prompt para Claude a partir del historial real (few-shot), las tiendas de hoy y la
// flota disponible. Puro y testeable. El aprendizaje es IN-CONTEXT: los ejemplos son asignaciones
// reales pasadas del coordinador → Claude infiere sus patrones (zona, tiendas que van juntas,
// preferencia de camión, capacidad). No hay reglas hardcodeadas de negocio.

import type { IAStore, IATruck, IAExample } from './types';

export const IA_SYSTEM_PROMPT = [
  'Eres el asistente de asignación de despacho de KiosClub. Tu tarea es asignar tiendas a camiones',
  '(patentes) ANTES de calcular la ruta, imitando cómo lo hace el coordinador humano.',
  '',
  'Aprende de los EJEMPLOS históricos (asignaciones reales del coordinador): detecta con qué camión',
  'suele ir cada zona, qué tiendas se agrupan juntas, y cómo reparte la carga. Respeta SIEMPRE:',
  '- La capacidad de cada camión (suma de pallets ≤ capP; bultos ≤ capB).',
  '- Asignar cada tienda a un solo camión. No inventes tiendas ni patentes que no estén en la lista.',
  '- Preferir agrupar tiendas de la misma zona/corredor en el mismo camión, como en los ejemplos.',
  '- Si una tienda requiere frío, usar un camión refrigerado.',
  '',
  'Responde ÚNICAMENTE con un objeto JSON: { "PATENTE": ["cod1","cod2"], ... }. Sin texto extra,',
  'sin explicaciones, sin markdown. Si no puedes asignar una tienda, simplemente no la incluyas.',
].join('\n');

function fmtStores(stores: IAStore[]): string {
  return stores
    .map(s => `${s.cod} (P${s.p} B${s.b}${s.ch ? ` CH${s.ch}` : ''}${s.zona ? ` · ${s.zona}` : ''})`)
    .join(', ');
}

function fmtTrucks(trucks: IATruck[]): string {
  return trucks
    .map(t => `${t.patente} (capP ${t.capP}, capB ${t.capB}${t.refrigerado ? ', frío' : ''}${t.porton ? ', portón' : ''})`)
    .join('\n');
}

function fmtExamples(examples: IAExample[]): string {
  if (!examples.length) return '(sin historial aún — usa criterio general de zona y capacidad)';
  return examples
    .map(ex => {
      const lines = Object.entries(ex.asignacion)
        .filter(([, cods]) => cods.length)
        .map(([pat, cods]) => `  ${pat}: ${cods.join(', ')}`)
        .join('\n');
      return `Día ${ex.fecha}:\n${lines}`;
    })
    .join('\n\n');
}

/** Devuelve el mensaje de usuario para Claude (el system va aparte en IA_SYSTEM_PROMPT). */
export function buildAsignacionUserPrompt(params: {
  stores: IAStore[];
  trucks: IATruck[];
  examples: IAExample[];
}): string {
  const { stores, trucks, examples } = params;
  return [
    '## Ejemplos históricos (asignaciones reales del coordinador)',
    fmtExamples(examples),
    '',
    '## Camiones disponibles hoy',
    fmtTrucks(trucks),
    '',
    '## Tiendas a asignar hoy',
    fmtStores(stores),
    '',
    'Devuelve el JSON de asignación { "PATENTE": ["cod", ...] } respetando capacidad y los patrones de los ejemplos.',
  ].join('\n');
}
