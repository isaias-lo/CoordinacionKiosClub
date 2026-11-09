// La zona con la que se pinta cada tienda en la planilla, y sus colores. Módulo puro.
//
// ── POR QUÉ LOS COLORES VIVEN ACÁ ─────────────────────────────────────────────────────────────
//
// El coordinador pidió que las tiendas salgan con el color de su ruta, «algo así lo ves en el
// sistema». Ya existe esa paleta: `CalendarioColumnas.handlePrint` pinta con ella el
// calendario impreso. Si la planilla copiara los hexadecimales serían tres copias del mismo dato
// en el repositorio —ese archivo ya tiene dos—, y al cambiar un color una quedaría atrás.
//
// ── LA REGLA QUE NO ES OBVIA ──────────────────────────────────────────────────────────────────
//
// Una tienda de Regiones que además es MALL va pintada por su RUTA, no de rosa: el rosa es solo
// para los malls de RM. Es lo que hace el calendario —arma las columnas `fal` → norte/sur antes de
// preguntar por el tipo— y hay que respetarlo o la hoja contradice al calendario que está al lado.
// Hoy aplica a 46TRE, 36CHL y 60PBL.
//
// El mall lo decide `esMall` por la misma razón que norte/sur lo deciden `grupoDeSector` y
// `esRegionNorte`: para que la hoja no pueda contradecir al calendario.
//
// ── LOS LÍMITES DE `rm` ───────────────────────────────────────────────────────────────────────
//
// `rm` junta todo lo que no es mall, región ni costa: strip centers, `TIENDA`, y también `punto`,
// `oficina` y las fichas SIN sector. El rótulo dice «Stripcenter» porque es la palabra que usa el
// coordinador, pero el balde es más ancho que eso.
//
// Cuando el sector viene vacío, `grupoCalendario` cae a una heurística por tipo y dirección que
// puede mandar la tienda a región o a costa; `zonaPlanilla` va directo a `rm`/`mall`. Es
// deliberado —no se afirma una ruta que nadie verificó— pero es una divergencia con el calendario.

import { grupoDeSector, esRegionNorte } from '@/lib/sectores';
import { esMall } from '@/features/despacho/rutas/utils/tipoTienda';

// Los colores y el orden de la leyenda viven en `@/lib/coloresZona`, que es la ÚNICA tabla: la
// comparten esta planilla, el calendario impreso y lo que se escribe al Google Sheet. Estaban
// escritos tres veces y dos de las copias tenían el norte y el sur al revés. Se re-exportan desde
// acá para no tocar a los quince consumidores que ya importan de este archivo.
export { COLOR_ZONA, ZONAS } from '@/lib/coloresZona';
export type { ColorZona, ZonaPlanilla } from '@/lib/coloresZona';

import type { ZonaPlanilla } from '@/lib/coloresZona';

/** Lo mínimo de la ficha de `tiendas` que hace falta para decidir. */
export interface FichaZona {
  sector?: string | null;
  lat?: number | null;
  tipo?: string | null;
}

/**
 * La zona de una tienda. Sin sector no se adivina: cae en `rm`, que es el color neutro (gris pizarra muy claro, #F1F5F9),
 * no un color que afirme una ruta que nadie verificó.
 */
export function zonaPlanilla(f: FichaZona | null | undefined): ZonaPlanilla {
  const grupo = grupoDeSector(f?.sector);
  if (grupo === 'costa') return 'costa';
  // Regiones ANTES del tipo: un MALL de Regiones va por su ruta.
  if (grupo === 'fal') return esRegionNorte(f?.sector, f?.lat) ? 'norte' : 'sur';
  // `esMall` se llama con UN solo argumento a propósito: con dirección y zona activa además la
  // heurística vieja («Local 5» → mall), que el calendario dejó solo como último recurso. Acá
  // manda el `tipo` del catálogo y nada más.
  return esMall(f?.tipo) ? 'mall' : 'rm';
}
