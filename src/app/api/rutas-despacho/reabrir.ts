// Reglas puras de «Reabrir camión» (16/11/2026). Las usa el DELETE de /api/rutas-despacho.
//
// Reabrir deshace el manifiesto guardado al cerrar: sin eso, el camión se podría volver a cargar
// en el tablero mientras /conductor-hub, Bodega (tienda en morado) y el QR siguen mostrando la
// carga vieja — justo lo que `cierrePorVehiculo.ts` explica que no puede pasar («Un camión cerrado
// está CONGELADO»). Así que solo se reabre lo que todavía no empezó a moverse.

import { norm } from '@/features/despacho/rutas/utils/helpers';

/** ¿Los dos juegos de códigos son las mismas tiendas? (sin importar orden, repetidos ni tildes) */
export function mismasTiendas(a: string[], b: string[]): boolean {
  const firma = (xs: string[]) => [...new Set(xs.map(norm))].sort().join('|');
  return firma(a) === firma(b);
}

export interface CandidatoReabrir {
  id: number;
  patente: string | null;
  tipo: string | null;
  ruta_tiendas?: { store_cod: string }[] | null;
}

/**
 * Entre los manifiestos de la patente ese día, cuál es el del camión que se reabre.
 *
 * Puede haber más de uno con la misma patente y fecha: el de 1ª vuelta y el de 2ª vuelta, que se
 * guarda con la fecha de hoy. El camión cerrado está congelado, así que sus tiendas en el tablero
 * son exactamente las del manifiesto: se elige el que calza tienda por tienda. Si no calza
 * ninguno y hay uno solo, es ese. Si hay varios y ninguno calza, no se adivina: `null`.
 */
export function elegirManifiestoAReabrir<T extends CandidatoReabrir>(
  candidatos: T[],
  patente: string,
  tipo: 'seco' | 'congelado',
  cods: string[],
): T | null {
  const pat = (patente ?? '').trim().toUpperCase();
  const delCamion = candidatos.filter(c =>
    (c.patente ?? '').trim().toUpperCase() === pat && (c.tipo ?? 'seco') === tipo);
  if (!delCamion.length) return null;
  const exactos = delCamion.filter(c => mismasTiendas((c.ruta_tiendas ?? []).map(t => t.store_cod), cods ?? []));
  if (exactos.length === 1) return exactos[0];
  if (exactos.length > 1) return null;
  return delCamion.length === 1 ? delCamion[0] : null;
}

export interface EstadoParaReabrir {
  estado: string | null;
  tiendas: { estado_entrega: string | null; hora_entrega: string | null }[];
  eventos: number;
  unidadesMovidas: number;
}

/**
 * Por qué NO se puede reabrir, o `null` si se puede. Se reabre solo un camión que no salió:
 * la ruta en 'pendiente', ninguna parada entregada ni intentada, ningún evento del chofer
 * (escaneo del QR, entrega) y ninguna unidad de trazabilidad que haya pasado de CREADO.
 */
export function motivoNoReabrir(e: EstadoParaReabrir): string | null {
  if ((e.estado ?? 'pendiente') !== 'pendiente')
    return 'El camión ya salió: su ruta no está pendiente.';
  if (e.tiendas.some(t => (t.estado_entrega ?? 'pendiente') !== 'pendiente' || t.hora_entrega))
    return 'El camión ya tiene paradas entregadas o intentadas.';
  if (e.eventos > 0)
    return 'El chofer ya usó esta ruta (escaneó el QR o registró una entrega).';
  if (e.unidadesMovidas > 0)
    return 'Hay unidades de este camión que ya avanzaron en trazabilidad.';
  return null;
}

/**
 * Al guardar un manifiesto: ¿el código pedido ya es de OTRO camión? Lo es si es de otra patente,
 * o de esta patente con otras tiendas (su manifiesto de la otra vuelta). Un guardado a medias
 * (sin paradas todavía) o un pedido sin tiendas se toman como el mismo: es el reintento que
 * completa lo que faltó.
 */
export function codigoEsDeOtroCamion(
  guardado: { patente: string | null; cods: string[] },
  pedido: { patente: string; cods: string[] },
): boolean {
  const pat = (p: string | null | undefined) => String(p ?? '').trim().toUpperCase();
  if (pat(guardado.patente) !== pat(pedido.patente)) return true;
  if (!guardado.cods.length || !pedido.cods.length) return false;
  return !mismasTiendas(guardado.cods, pedido.cods);
}
