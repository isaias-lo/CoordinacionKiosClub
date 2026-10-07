// [Vista nueva · Plan] La columna ESTADO de la tabla de paradas (diseño A) y el resumen de cada
// ruta en la lista de la izquierda. Usa el mismo semáforo que la lista clásica (`estadoVentana`);
// solo agrega cuántos minutos de diferencia hay, que es lo que el diseño muestra.

import { parseVentana, estadoVentana } from './ventanaHoraria';

export type TonoParada = 'ok' | 'tarde' | 'espera' | 'neutro';

export interface EstadoParada { texto: string; tono: TonoParada }

/** «A tiempo», «Tarde 15 min», «Espera 10 min» o «Sin horario». Sin ETA, «—». */
export function estadoParadaPlan(eta: number | null | undefined, ventana?: string | null): EstadoParada {
  if (eta == null) return { texto: '—', tono: 'neutro' };
  const est = estadoVentana(eta, ventana);
  const w = parseVentana(ventana);
  if (est === 'tarde' && w) return { texto: `Tarde ${eta - w.cierra} min`, tono: 'tarde' };
  if (est === 'temprano' && w) return { texto: `Espera ${w.abre - eta} min`, tono: 'espera' };
  if (est === 'ok') return { texto: 'A tiempo', tono: 'ok' };
  return { texto: 'Sin horario', tono: 'neutro' };
}

/** «6 tiendas · ~58 km» o «vacía». */
export function resumenRutaPlan(paradas: number, km: string): string {
  if (paradas === 0) return 'vacía';
  return [`${paradas} ${paradas === 1 ? 'tienda' : 'tiendas'}`, km].filter(Boolean).join(' · ');
}
