import { isRegionesCod } from '../../regiones/data/tiendas';
import { getTiendaSantiagoByCod } from '../../santiago/data/tiendasSantiago';

export type ZonaCongelados = 'nacional' | 'rmcosta';

/**
 * Grupos del Calendario de Congelados (rm/costa/fal) que corresponden a cada zona de la
 * grilla. Nacional = catálogo de Regiones ('fal'); RM/Costa concatena ambos grupos porque
 * la sub-pantalla RM/Costa muestra las dos zonas juntas (igual que Bodega seco).
 */
export function gruposDeZona(zona: ZonaCongelados): Array<'rm' | 'costa' | 'fal'> {
  return zona === 'nacional' ? ['fal'] : ['rm', 'costa'];
}

/**
 * Determina si un código de tienda pertenece a la zona dada, usando los mismos catálogos que
 * el resto de la app (isRegionesCod para Nacional, getTiendaSantiagoByCod para RM/Costa). Se
 * usa para filtrar tiendas que llegan por picking (no por el calendario) y decidir en qué
 * sub-pantalla (Nacional / RM-Costa) deben aparecer.
 */
export function perteneceAZona(cod: string, zona: ZonaCongelados): boolean {
  return zona === 'nacional' ? isRegionesCod(cod) : getTiendaSantiagoByCod(cod) !== undefined;
}

/**
 * Arma la lista de códigos de tienda de la grilla de Congelados: unión de (a) los códigos del
 * calendario del día y (b) los códigos que tienen cajas de picking y pertenecen a la zona
 * (`perteneceAZonaFn`). Dedupe preservando orden: primero el calendario, luego las tiendas de
 * picking que no estaban ya. Función pura — recibe los códigos ya resueltos, no hace fetch.
 */
export function tiendasGrillaCongelados(
  codsCalendario: string[],
  codsConCajas: string[],
  perteneceAZonaFn: (cod: string) => boolean,
): string[] {
  const vistos = new Set<string>();
  const resultado: string[] = [];

  for (const cod of codsCalendario) {
    if (!cod || vistos.has(cod)) continue;
    vistos.add(cod);
    resultado.push(cod);
  }

  for (const cod of codsConCajas) {
    if (!cod || vistos.has(cod)) continue;
    if (!perteneceAZonaFn(cod)) continue;
    vistos.add(cod);
    resultado.push(cod);
  }

  return resultado;
}
