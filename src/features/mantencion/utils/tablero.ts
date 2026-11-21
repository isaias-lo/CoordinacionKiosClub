// El tablero de Jesús: qué solicitudes cuentan, cuáles esperan revisión y cómo queda cada tienda.
// Módulo puro: recibe las solicitudes y la configuración, devuelve lo que se dibuja.
//
// ── UN POSIBLE DUPLICADO NO SUMA MIENTRAS NO SE DECIDA ────────────────────────────────────────
//
// Así lo dice el mockup aprobado: «mientras no decidas, la nueva no suma al conteo de la tienda».
// Si sumara, dos fotos de la misma luminaria harían saltar la alerta de volumen de una tienda que
// tiene un solo problema. La ORIGINAL sí suma: es una solicitud real en cualquier caso.
//
// ── «NO ES DUPLICADO» SE RECUERDA ─────────────────────────────────────────────────────────────
//
// La regla de duplicados (misma tienda, misma categoría) se recalcula cada vez. Sin recordar la
// decisión, el par que Jesús ya descartó volvería a aparecer en el siguiente refresco. La decisión
// queda en la bitácora (`mant_eventos`, campo `no_es_duplicado`) y llega acá como lista de pares.

import { posiblesDuplicados, type ParDuplicado } from './duplicados';
import { ordenarPorPrioridad } from './prioridad';
import { alertasDeTienda, nivelDeTienda, type Alerta, type NivelAlerta } from './alertas';
import { esAbierta } from './conversacion';
import { fechaChileDe } from '@/lib/fechaChile';
import type { SolicitudMant, TiendaMant } from '../tipos';

export interface ConfigMant {
  umbralTotal: number;
  umbralSinProgramar: number;
  diasAntiguedad: number;
  diasAvisoPrecierre: number;
  pesoUrgente: number;
  diasPorSolicitud: number;
}

/** Los valores de la semilla de `mant_config`. Solo se usan si la fila no se pudo leer. */
export const CONFIG_POR_DEFECTO: ConfigMant = {
  umbralTotal: 5, umbralSinProgramar: 5, diasAntiguedad: 7,
  diasAvisoPrecierre: 3, pesoUrgente: 5, diasPorSolicitud: 2,
};

/** Un par que Jesús ya marcó como «no es duplicado». */
export interface ParDescartado { originalId: string; posibleId: string }

/** Abierta y no unida a otra: es trabajo pendiente de verdad. */
export function esTrabajoAbierto(s: SolicitudMant): boolean {
  return esAbierta(s.estado) && !s.duplicadaDe;
}

/**
 * Sin fecha de visita. En la Fase 1 no hay rutas, así que es todo lo pendiente; `no_resuelta`
 * también, porque hay que volver a programarla.
 */
export function esSinProgramar(s: SolicitudMant): boolean {
  return s.estado === 'pendiente' || s.estado === 'no_resuelta';
}

/** Los pares de posibles duplicados que todavía esperan una decisión. */
export function duplicadosPendientes(
  solicitudes: readonly SolicitudMant[],
  descartados: readonly ParDescartado[] = [],
): Array<ParDuplicado<SolicitudMant>> {
  const ya = new Set(descartados.map(d => `${d.originalId}|${d.posibleId}`));
  return posiblesDuplicados(solicitudes.filter(esTrabajoAbierto))
    .filter(p => !ya.has(`${p.original.id}|${p.posible.id}`) && !ya.has(`${p.posible.id}|${p.original.id}`));
}

/** Las que todavía no tienen urgencia, sin las que esperan decisión de duplicado. */
export function sinClasificar(
  solicitudes: readonly SolicitudMant[],
  pendientes: ReadonlyArray<ParDuplicado<SolicitudMant>>,
): SolicitudMant[] {
  const enDuda = new Set(pendientes.map(p => p.posible.id));
  return solicitudes
    .filter(s => esTrabajoAbierto(s) && s.estado === 'pendiente' && !s.urgencia && !enDuda.has(s.id))
    .sort((a, b) => a.creadaEn.localeCompare(b.creadaEn));
}

/** Días de Chile entre la creación y `ahora`. */
export function diasDesde(iso: string, ahora: Date = new Date()): number {
  const d = fechaChileDe(iso);
  const h = fechaChileDe(ahora);
  if (!d || !h) return 0;
  return Math.max(0, Math.round((Date.parse(`${h}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000));
}

export interface FichaTienda {
  codigoTienda: string;
  nombre: string;
  zona: string;
  abiertas: number;
  sinProgramar: number;
  urgentes: number;
  diasMasAntigua: number;
  esperaMaterial: boolean;
  porRevisar: number;
  puntaje: number;
  alertas: Alerta[];
  nivel: NivelAlerta | null;
}

/**
 * Una ficha por tienda con trabajo abierto, ordenadas por prioridad (`prioridad.ts`).
 *
 * Las tiendas sin nada abierto no aparecen: son decenas de tarjetas vacías entre las que habría que
 * buscar las que importan.
 */
export function fichasDelTablero(
  solicitudes: readonly SolicitudMant[],
  tiendas: readonly TiendaMant[],
  config: ConfigMant,
  descartados: readonly ParDescartado[] = [],
  ahora: Date = new Date(),
): FichaTienda[] {
  const pendientes = duplicadosPendientes(solicitudes, descartados);
  const enDuda = new Set(pendientes.map(p => p.posible.id));
  const porRevisarIds = new Set([
    ...sinClasificar(solicitudes, pendientes).map(s => s.id),
    ...pendientes.map(p => p.posible.id),
  ]);
  const info = new Map(tiendas.map(t => [t.codigo.toUpperCase(), t]));

  const porTienda = new Map<string, SolicitudMant[]>();
  for (const s of solicitudes) {
    if (!esTrabajoAbierto(s)) continue;
    const cod = s.codigoTienda.toUpperCase();
    const lista = porTienda.get(cod) ?? [];
    lista.push(s);
    porTienda.set(cod, lista);
  }

  const fichas = [...porTienda.entries()].map(([cod, todas]) => {
    const cuentan = todas.filter(s => !enDuda.has(s.id));
    const t = info.get(cod);
    const base = {
      codigoTienda: t?.codigo ?? todas[0].codigoTienda,
      nombre: t?.nombre ?? todas[0].nombreTienda,
      zona: t?.zona ?? 'Sin zona',
      abiertas: cuentan.length,
      sinProgramar: cuentan.filter(esSinProgramar).length,
      urgentes: cuentan.filter(s => s.urgencia === 'urgente').length,
      diasMasAntigua: cuentan.reduce((m, s) => Math.max(m, diasDesde(s.creadaEn, ahora)), 0),
      esperaMaterial: cuentan.some(s => s.esperaMaterial),
      porRevisar: todas.filter(s => porRevisarIds.has(s.id)).length,
    };
    const umbrales = {
      umbralSinProgramar: config.umbralSinProgramar,
      umbralTotal: config.umbralTotal,
      diasAntiguedad: config.diasAntiguedad,
    };
    return { ...base, alertas: alertasDeTienda(base, umbrales), nivel: nivelDeTienda(base, umbrales) };
  });

  return ordenarPorPrioridad(fichas, { pesoUrgente: config.pesoUrgente, diasPorSolicitud: config.diasPorSolicitud });
}

/** Los cuatro números de arriba del tablero. */
export function contadoresDelTablero(
  fichas: readonly FichaTienda[],
  solicitudes: readonly SolicitudMant[],
  descartados: readonly ParDescartado[] = [],
): { abiertas: number; tiendasEnAlerta: number; urgentes: number; porRevisar: number } {
  const pendientes = duplicadosPendientes(solicitudes, descartados);
  return {
    abiertas: fichas.reduce((s, f) => s + f.abiertas, 0),
    tiendasEnAlerta: fichas.filter(f => f.nivel !== null).length,
    urgentes: fichas.reduce((s, f) => s + f.urgentes, 0),
    porRevisar: sinClasificar(solicitudes, pendientes).length + pendientes.length,
  };
}

/** Cómo se lee una alerta en la tarjeta. */
export function textoAlerta(a: Alerta): string {
  switch (a.tipo) {
    case 'sin_programar':   return `${a.valor} sin programar`;
    case 'volumen_total':   return `${a.valor} abiertas`;
    case 'urgencia':        return a.valor === 1 ? '1 urgente' : `${a.valor} urgentes`;
    case 'antiguedad':      return `la más antigua: ${a.valor} días`;
    case 'espera_material': return 'espera material';
  }
}
