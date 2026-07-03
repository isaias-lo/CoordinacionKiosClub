// Parsea la respuesta de Claude y la CONVIERTE en una asignación válida. La validez la garantiza
// el código, no el LLM: solo patentes/cods conocidos, cada tienda ≤ 1 vez, y se repara el exceso de
// capacidad (las tiendas que no caben quedan sin asignar → vuelven al pool para que el coordinador
// las arrastre). Puro y testeable.

import type { IAStore, IATruck, IAProposal, IAAssignedStore } from './types';

/** Extrae el primer objeto JSON de un texto (tolera code fences / texto alrededor). */
export function extractJson(raw: string): unknown {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Convierte la respuesta cruda de Claude en `{ asignaciones, warnings }`:
 * - Solo patentes de `trucks` y cods de `stores` (descarta lo desconocido → warning).
 * - Cada tienda a un solo camión (si se repite, gana la primera → warning).
 * - Repara capacidad: por camión, agrega tiendas mientras no exceda capP/capB; las que exceden
 *   quedan SIN asignar (vuelven al pool) → warning.
 */
export function parseProposal(raw: string, stores: IAStore[], trucks: IATruck[]): IAProposal {
  const warnings: string[] = [];
  const asignaciones: Record<string, IAAssignedStore[]> = {};

  const storeByCod = new Map(stores.map(s => [s.cod, s]));
  const truckByPat = new Map(trucks.map(t => [t.patente, t]));

  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== 'object') {
    return { asignaciones: {}, warnings: ['No se pudo interpretar la respuesta de la IA.'] };
  }

  const usados = new Set<string>();
  const desconocidas = new Set<string>();

  for (const [pat, codsRaw] of Object.entries(parsed as Record<string, unknown>)) {
    const truck = truckByPat.get(pat);
    if (!truck) { warnings.push(`Patente desconocida ignorada: ${pat}`); continue; }
    if (!Array.isArray(codsRaw)) continue;

    let sumP = 0, sumB = 0;
    const asignadas: IAAssignedStore[] = [];
    const excedidas: string[] = [];

    for (const codRaw of codsRaw) {
      const cod = String(codRaw);
      const s = storeByCod.get(cod);
      if (!s) { desconocidas.add(cod); continue; }
      if (usados.has(cod)) { warnings.push(`Tienda duplicada, se mantiene la primera asignación: ${cod}`); continue; }

      if (sumP + s.p > truck.capP || sumB + s.b > truck.capB) {
        excedidas.push(cod);
        continue; // no cabe → queda en el pool
      }
      sumP += s.p; sumB += s.b;
      usados.add(cod);
      asignadas.push({ c: s.cod, p: s.p, b: s.b, ch: s.ch });
    }

    if (excedidas.length) {
      warnings.push(`${truck.patente} llegó a su capacidad; sin asignar: ${excedidas.join(', ')}`);
    }
    if (asignadas.length) asignaciones[pat] = asignadas;
  }

  if (desconocidas.size) {
    warnings.push(`Tiendas desconocidas ignoradas: ${[...desconocidas].join(', ')}`);
  }

  const sinAsignar = stores.filter(s => !usados.has(s.cod)).map(s => s.cod);
  if (sinAsignar.length) {
    warnings.push(`${sinAsignar.length} tienda(s) quedaron en el pool para asignar a mano: ${sinAsignar.join(', ')}`);
  }

  return { asignaciones, warnings };
}
