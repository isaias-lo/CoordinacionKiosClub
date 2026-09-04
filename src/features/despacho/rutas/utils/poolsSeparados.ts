// Dos pools: Regiones y RM/Costa.
//
// Regiones y RM/Costa se arman en momentos distintos del día y las llevan empresas distintas.
// Trabajarlos en una sola lista obliga a mirar 29 tiendas cuando solo interesan 8, y —peor— hace
// que las operaciones de conjunto ("Listo por hoy", "Limpiar") alcancen a un grupo que todavía no
// se había terminado de armar.
//
// Sobre 125 camiones reales desde el 01/08, el 97,6% lleva tiendas de un solo grupo: la separación
// describe cómo ya se trabaja, no impone nada nuevo.
//
// El TABLERO sigue siendo uno. Solo cambia qué se mira y sobre qué actúan los botones — así la
// capacidad de un camión, su cierre y su manifiesto se siguen calculando sobre toda su carga,
// aunque excepcionalmente lleve tiendas de los dos pools.

import { empresaHabilitada, type ConfigZonas } from './zonasTransporte';
import type { ZonaRuteo } from '@/lib/sectores';
import type { Vehiculo } from '../data/flota';

/** Los dos pools con los que trabaja el coordinador. */
export type PoolScope = 'regiones' | 'rm-costa';

export const POOLS: { id: PoolScope; label: string; zonas: ZonaRuteo[] }[] = [
  { id: 'regiones', label: 'REGIONES',  zonas: ['sur', 'norte'] },
  { id: 'rm-costa', label: 'RM / COSTA', zonas: ['santiago', 'costa'] },
];

/**
 * A qué pool pertenece un grupo del calendario.
 *
 * Un grupo desconocido cae en RM/Costa. No es arbitrario: es donde el registro lo va a escribir
 * (`tablaDeGrupo` manda a `despacho_rm` todo lo que no sea 'fal'), así que mostrarlo ahí es lo
 * único que evita que se vea en un pool y se registre en el otro. Antes el orden del pool lo
 * trataba como Regiones y el registro como RM: dos defaults opuestos para el mismo caso.
 */
export function poolDeGrupo(g?: string): PoolScope {
  return g === 'fal' ? 'regiones' : 'rm-costa';
}

/** ¿Este grupo se ve en este pool? */
export function enPool(g: string | undefined, scope: PoolScope): boolean {
  return poolDeGrupo(g) === scope;
}

/** ¿El grupo está sin definir? Se marca en pantalla para que nadie lo dé por sentado. */
export function grupoIndefinido(g?: string): boolean {
  return !g || (g !== 'fal' && g !== 'rm' && g !== 'costa');
}

/** Los códigos de un pool, a partir del grupo de cada tienda. */
export function codsDePool<T extends { g?: string }>(
  calT: Record<string, T>,
  scope: PoolScope,
): string[] {
  return Object.keys(calT).filter(c => enPool(calT[c]?.g, scope));
}

/**
 * Los camiones que este pool ofrece: los de empresas habilitadas para alguna de sus zonas, según
 * Config → Transportistas.
 *
 * Es la capa 3 del Enrutador puesta a trabajar en el tablero. Sin config (o si el endpoint falló)
 * se devuelve la flota entera: mejor mostrar de más que dejar al coordinador sin camiones.
 */
export function flotaDePool(
  flota: Vehiculo[],
  scope: PoolScope,
  cfg: ConfigZonas | undefined,
): Vehiculo[] {
  if (!cfg) return flota;
  const zonas = POOLS.find(p => p.id === scope)?.zonas ?? [];
  const cfgs = zonas.map(z => cfg[z]).filter((c): c is NonNullable<typeof c> => !!c);
  if (!cfgs.length) return flota;
  return flota.filter(v => cfgs.some(c => empresaHabilitada(v.empresa, c)));
}

/**
 * Camiones que el pool NO ofrece pero que igual hay que mostrar, porque ya llevan carga.
 *
 * Pasa en dos casos legítimos: se tomó un camión de otra empresa como excepción, o cambió la
 * config de Transportistas con el día ya armado. Esconderlos dejaría carga asignada fuera de la
 * vista — que es exactamente el tipo de pérdida silenciosa que se está tratando de eliminar.
 */
export function camionesExtra<T>(
  flota: Vehiculo[],
  ofrecidos: Vehiculo[],
  asignaciones: Record<string, T[]>,
): Vehiculo[] {
  const yaOfrecidos = new Set(ofrecidos.map(v => v.p));
  return flota.filter(v => !yaOfrecidos.has(v.p) && (asignaciones[v.p]?.length ?? 0) > 0);
}
