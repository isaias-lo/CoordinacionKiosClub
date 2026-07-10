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
  'suele ir cada zona, qué tiendas se agrupan juntas, qué camión usa para cada corredor y cómo',
  'reparte la carga. Prioriza replicar esos patrones por encima de cualquier otra heurística.',
  '',
  'Reglas OBLIGATORIAS:',
  '- Capacidad: la suma de pallets de un camión ≤ capP y la de bultos ≤ capB. Nunca la excedas.',
  '- Cada tienda va a UN solo camión. No inventes tiendas ni patentes fuera de las listas dadas.',
  '- Frío: una tienda que requiera frío va en un camión refrigerado.',
  '',
  'Criterios de calidad (muy importante — el resultado anterior fallaba acá):',
  '- APROVECHA la flota: intenta asignar TODAS las tiendas. No dejes tiendas sin asignar si hay',
  '  capacidad libre en algún camión compatible.',
  '- BALANCEA la carga: no dejes un camión grande casi vacío mientras otros van llenos. Usa el',
  '  tamaño del camión (grande/mediano/chico) para decidir cuánta carga darle: los grandes llevan más.',
  '- AGRUPA por zona/corredor: tiendas de la misma zona en el mismo camión, como en los ejemplos.',
  '- CERCANÍA GPS: si se incluye una "Referencia geográfica", úsala como PISTA de qué tiendas quedan',
  '  cerca entre sí para acortar la ruta — sin romper los patrones históricos ni la capacidad.',
  '',
  'Responde ÚNICAMENTE con un objeto JSON: { "PATENTE": ["cod1","cod2"], ... }. Sin texto extra,',
  'sin explicaciones, sin markdown.',
].join('\n');

function fmtStores(stores: IAStore[]): string {
  return stores
    .map(s => `${s.cod} (P${s.p} B${s.b}${s.ch ? ` CH${s.ch}` : ''}${s.zona ? ` · ${s.zona}` : ''})`)
    .join(', ');
}

function fmtTrucks(trucks: IATruck[]): string {
  return trucks
    .map(t => `${t.patente} — ${t.tipo || 'camión'} · capacidad ${t.capP} pallets / ${t.capB} bultos${t.refrigerado ? ' · frío' : ''}${t.porton ? ' · portón' : ''}`)
    .join('\n');
}

/** Agrupación por cercanía GPS del optimizador (patente → cods). Pista geográfica, no obligatoria. */
function fmtGpsRef(gpsRef?: Record<string, string[]>): string {
  if (!gpsRef) return '';
  return Object.entries(gpsRef)
    .filter(([, cods]) => cods.length)
    .map(([pat, cods]) => `  ${pat}: ${cods.join(', ')}`)
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
  gpsRef?: Record<string, string[]>;  // agrupación por cercanía GPS del optimizador (pista)
}): string {
  const { stores, trucks, examples, gpsRef } = params;
  const gpsSection = fmtGpsRef(gpsRef);
  return [
    '## Ejemplos históricos (asignaciones reales del coordinador)',
    fmtExamples(examples),
    '',
    '## Camiones disponibles hoy',
    fmtTrucks(trucks),
    '',
    ...(gpsSection ? [
      '## Referencia geográfica (agrupación por cercanía GPS — NO obligatoria)',
      'El optimizador agrupó así las tiendas por cercanía. Úsala solo como pista de qué tiendas quedan',
      'cerca entre sí; prioriza los patrones históricos y la capacidad. No copies las patentes de aquí',
      'si el historial sugiere otra cosa.',
      gpsSection,
      '',
    ] : []),
    '## Tiendas a asignar hoy',
    fmtStores(stores),
    '',
    'Devuelve el JSON de asignación { "PATENTE": ["cod", ...] } respetando capacidad y los patrones de los ejemplos.',
  ].join('\n');
}
