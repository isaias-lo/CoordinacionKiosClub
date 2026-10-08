// Rutas favoritas del Plan: guardar una ruta con su orden para repetirla otro día.
//
// Una favorita guarda las paradas EN EL ORDEN en que se veían al guardarla (lo que el usuario quiere
// repetir) y las direcciones libres que use. Al usarla vuelve como una ruta nueva en orden «A mano»,
// así el orden guardado no se reordena solo por horarios o cercanía; cambiar el orden después sigue
// siendo un toque.
//
// Se comparten entre equipos por `shared_session_state` (fuente `plan_favoritas`, una sola fila con
// fecha fija) y se cachean en localStorage para abrir sin red. Puro y testeable: no toca React, ni
// la base, ni localStorage.

import { esParadaDireccion, nuevoParadaDireccionId, type ParadaDireccion } from './planificador';

export interface RutaFavorita {
  id: string;
  nombre: string;
  /** Códigos de tienda y de dirección (`DIR-n`), en el orden en que se guardó. */
  paradas: string[];
  direcciones: ParadaDireccion[];
  carga?: 'seco' | 'congelados';
  /** ms desde epoch; ordena la lista, la más nueva arriba. */
  creada: number;
}

/** La fila compartida no es de un día: todas las favoritas viven en esta fecha fija. */
export const FECHA_FAVORITAS = '2000-01-01';
export const LS_FAVORITAS = 'enrutador_plan_favoritas';
export const NOMBRE_FAVORITA_MAX = 60;

/** Lo que llegue de la base o de localStorage, saneado. Lo que no se entienda se descarta. */
export function normalizarFavoritas(raw: unknown): RutaFavorita[] {
  const lista = Array.isArray(raw) ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { favoritas?: unknown }).favoritas)
      ? (raw as { favoritas: unknown[] }).favoritas : [];
  const out: RutaFavorita[] = [];
  const ids = new Set<string>();
  for (const f of lista) {
    if (!f || typeof f !== 'object') continue;
    const o = f as Partial<RutaFavorita>;
    if (typeof o.id !== 'string' || !o.id || ids.has(o.id)) continue;
    const nombre = typeof o.nombre === 'string' ? o.nombre.trim().slice(0, NOMBRE_FAVORITA_MAX) : '';
    const paradas = Array.isArray(o.paradas) ? o.paradas.filter((c): c is string => typeof c === 'string' && !!c) : [];
    if (!nombre || !paradas.length) continue;
    const direcciones = Array.isArray(o.direcciones)
      ? o.direcciones.filter((d): d is ParadaDireccion =>
          !!d && typeof d.id === 'string' && typeof d.label === 'string'
          && Array.isArray(d.gps) && d.gps.length === 2 && d.gps.every(n => typeof n === 'number' && Number.isFinite(n)))
      : [];
    // Una dirección sin coordenadas no se puede dibujar ni rutear: se cae de la favorita.
    const conGps = new Set(direcciones.map(d => d.id));
    ids.add(o.id);
    out.push({
      id: o.id, nombre,
      paradas: paradas.filter(c => !esParadaDireccion(c) || conGps.has(c)),
      direcciones: direcciones.filter(d => paradas.includes(d.id)),
      carga: o.carga === 'congelados' ? 'congelados' : o.carga === 'seco' ? 'seco' : undefined,
      creada: typeof o.creada === 'number' && Number.isFinite(o.creada) ? o.creada : 0,
    });
  }
  return out.filter(f => f.paradas.length > 0).sort((a, b) => b.creada - a.creada);
}

/** Una favorita nueva a partir de la ruta tal como se ve. Solo guarda las direcciones que usa. */
export function crearFavorita(opts: {
  id: string; nombre: string; orden: string[]; direcciones: ParadaDireccion[];
  carga?: 'seco' | 'congelados'; ahora: number;
}): RutaFavorita | null {
  const nombre = opts.nombre.trim().slice(0, NOMBRE_FAVORITA_MAX);
  const paradas = opts.orden.filter(Boolean);
  if (!nombre || !paradas.length) return null;
  return {
    id: opts.id, nombre, paradas,
    direcciones: opts.direcciones.filter(d => paradas.includes(d.id)),
    carga: opts.carga, creada: opts.ahora,
  };
}

/**
 * Suma una favorita. Si ya hay una con el mismo nombre (sin mirar mayúsculas), la reemplaza:
 * guardar «Ruta Oriente» otra vez es actualizarla, no tener dos iguales que no se distinguen.
 */
export function agregarFavorita(lista: RutaFavorita[], fav: RutaFavorita): RutaFavorita[] {
  const clave = fav.nombre.toLocaleLowerCase('es');
  return [fav, ...lista.filter(f => f.nombre.toLocaleLowerCase('es') !== clave && f.id !== fav.id)];
}

export function quitarFavorita(lista: RutaFavorita[], id: string): RutaFavorita[] {
  return lista.filter(f => f.id !== id);
}

/**
 * Las paradas y direcciones listas para una ruta nueva del Plan. Las direcciones se renombran con
 * ids libres (`DIR-n`) contra los que ya usan las otras rutas: dos rutas con el mismo `DIR-1` se
 * pisarían las coordenadas en el mapa.
 */
export function paradasDesdeFavorita(fav: RutaFavorita, idsEnUso: Iterable<string>): {
  selected: string[]; customStops: ParadaDireccion[];
} {
  const usados = new Set(idsEnUso);
  const renombre = new Map<string, string>();
  const customStops: ParadaDireccion[] = [];
  for (const d of fav.direcciones) {
    const id = nuevoParadaDireccionId(usados);
    usados.add(id);
    renombre.set(d.id, id);
    customStops.push({ ...d, id });
  }
  return { selected: fav.paradas.map(c => renombre.get(c) ?? c), customStops };
}

/** «6 tiendas · 1 dirección» para la fila de la favorita. */
export function resumenFavorita(fav: RutaFavorita): string {
  const nDir = fav.paradas.filter(esParadaDireccion).length;
  const nTiendas = fav.paradas.length - nDir;
  const partes = [];
  if (nTiendas) partes.push(`${nTiendas} ${nTiendas === 1 ? 'tienda' : 'tiendas'}`);
  if (nDir) partes.push(`${nDir} ${nDir === 1 ? 'dirección' : 'direcciones'}`);
  return partes.join(' · ');
}
