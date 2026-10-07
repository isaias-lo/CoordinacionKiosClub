// A qué tabla va la fila que Picking escribe al crear un slot, y con qué datos de tienda. PURO.
//
// ── LO QUE PASABA ─────────────────────────────────────────────────────────────────────────────
//
// La tabla estaba FIJA en el código (`despacho_rm`) y la tienda se buscaba en el catálogo estático
// de Santiago, que no conoce Regiones. Para una tienda de Región eso daba:
//
//     tienda: '47PTV'   ← el código, no el nombre
//     region: 'RM'      ← el `?? 'RM'` del default
//     comuna: ''
//
// Medido el 07/10/2026: **443 filas de 18 tiendas de Región** así, en la tabla de RM.
//
// ── POR QUÉ IMPORTA, QUE NO ES LO QUE PARECE ──────────────────────────────────────────────────
//
// Estas filas no llevan peso, así que el CRUCE no se infla (lee las dos tablas y deduplica por
// `picking_slot_id`), y tampoco llegan a la hoja. El daño está en `/api/pallet-lookup`, que es lo
// que precarga el formulario de Recepción y el del conductor: busca en `despacho_rm` PRIMERO, así
// que encuentra este borrador y no la fila de verdad.
//
// Medido: **95 ids viven en las dos tablas y en 82 la fila de RM está vacía mientras la de
// Nacional tiene el peso**. O sea que escanear el QR de un pallet de Región abría el formulario
// con el código en vez del nombre y sin conductor ni ruta. Ejemplo real, `P447PTV01102026P`:
// la tabla de RM dice «47PTV · RM · sin peso» y la de Nacional «Puerto Varas · 216 kg · VXSX43».
//
// ── LA FUENTE CORRECTA ────────────────────────────────────────────────────────────────────────
//
// La tabla `tiendas`, que es la que Config escribe y la única que conoce a todas — el mismo
// criterio y el mismo motivo que `catalogoServidor.ts` del #677. El catálogo estático queda de
// respaldo y se consulta DESPUÉS, nunca antes.

import { esSectorRegiones } from '@/features/despacho/regiones/data/tiendas';

/** Las comunas que el sistema trata como urbanas. */
const COMUNAS_URBANAS: ReadonlySet<string> = new Set([
  'Santiago', 'Providencia', 'Las Condes', 'Vitacura', 'Ñuñoa',
  'Maipú', 'La Florida', 'Quilicura', 'Huechuraba', 'La Reina',
  'Lo Barnechea', 'Puente Alto',
]);

/** Lo que hace falta de la tabla `tiendas`. */
export interface TiendaDeLaBD {
  nombre?: unknown;
  region?: unknown;
  sector_comuna?: unknown;
}

/** Lo que trae el catálogo estático de Santiago, cuando la tienda está ahí. */
export interface TiendaEstatica {
  tienda: string;
  region: string;
  comuna: string;
}

export interface DestinoDeLaFila {
  tabla: 'despacho_rm' | 'despacho_regiones';
  tienda: string;
  region: string;
  comuna: string;
  tipo_comuna: 'Urbano' | 'Extraurbano';
}

/**
 * Dónde va la fila y con qué datos. La BD manda; el estático es respaldo.
 *
 * Sin ninguno de los dos la fila va igual a `despacho_rm` con el código por nombre: es lo que
 * hacía antes, y perder la fila sería peor que escribirla incompleta. Lo que cambia es que ahora
 * eso solo pasa con una tienda que no existe en NINGÚN catálogo.
 */
export function destinoDeLaFila(
  cod: string,
  deLaBD: TiendaDeLaBD | null | undefined,
  respaldo: TiendaEstatica | null | undefined,
): DestinoDeLaFila {
  const nombreBD = String(deLaBD?.nombre ?? '').trim();
  const sectorBD = deLaBD?.sector_comuna == null ? '' : String(deLaBD.sector_comuna).trim();
  const regionBD = String(deLaBD?.region ?? '').trim();

  // La zona sale del sector, que es el mismo criterio que usa Bodega (`esSectorRegiones`). Sin
  // fila en la BD no se puede saber, y el respaldo solo tiene tiendas de Santiago: va a RM.
  const esDeRegiones = !!sectorBD && esSectorRegiones(sectorBD);

  const comuna = sectorBD || respaldo?.comuna || '';
  return {
    tabla:       esDeRegiones ? 'despacho_regiones' : 'despacho_rm',
    tienda:      nombreBD || respaldo?.tienda || cod,
    region:      regionBD || respaldo?.region || (esDeRegiones ? '' : 'RM'),
    comuna,
    tipo_comuna: COMUNAS_URBANAS.has(comuna) ? 'Urbano' : 'Extraurbano',
  };
}
