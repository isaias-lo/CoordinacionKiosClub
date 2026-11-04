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

export type ZonaPlanilla = 'norte' | 'sur' | 'costa' | 'mall' | 'rm';

export interface ColorZona { bg: string; text: string; border: string; label: string }

/** Los cinco colores, tal cual `CalendarioColumnas.handlePrint`. */
export const COLOR_ZONA: Record<ZonaPlanilla, ColorZona> = {
  norte: { bg: '#FEF08A', text: '#713F12', border: '#FDE047', label: 'Ruta Norte'  },
  sur:   { bg: '#BAE6FD', text: '#0C4A6E', border: '#7DD3FC', label: 'Ruta Sur'    },
  costa: { bg: '#99F6E4', text: '#134E4A', border: '#5EEAD4', label: 'Costa'       },
  mall:  { bg: '#FECDD3', text: '#881337', border: '#FDA4AF', label: 'Mall RM'     },
  rm:    { bg: '#F1F5F9', text: '#334155', border: '#CBD5E1', label: 'Stripcenter' },
};

/** El orden en que se muestra la leyenda. */
export const ZONAS: ZonaPlanilla[] = ['norte', 'sur', 'costa', 'mall', 'rm'];

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
