// A qué bodega pertenece cada tienda, VISTO DESDE EL SERVIDOR.
//
// ── POR QUÉ NO SIRVEN LOS CATÁLOGOS DEL NAVEGADOR ─────────────────────────────────────────────
//
// `repartirCongelados` necesita dos preguntas: ¿es de Nacional? ¿es de RM/Costa? Hasta ahora se las
// contestaban `isRegionesCod` y `getTiendaSantiagoByCod`, y las dos fallan acá por el mismo motivo:
//
//   · `REGIONES_CODS` arranca con 17 códigos curados a mano y CRECE en runtime, cuando una pantalla
//     llama a `registrarTiendasBD`. En el servidor eso no pasa nunca: se queda en 17.
//   · el catálogo estático de Santiago tiene 37 y tampoco se hidrata.
//
// O sea que el servidor conoce 54 tiendas y el negocio tiene más. Una tienda creada desde
// Config. Tiendas no está en ninguno de los dos, cae en `huerfanos` y SU FILA NO SE SINCRONIZA.
//
// ── LO QUE SE PERDIÓ ──────────────────────────────────────────────────────────────────────────
//
// Medido el 02/10/2026 contra la hoja DESPACHO CONGELADOS y la base: 27 filas de cuatro tiendas
// —26ALC (4), 56PZA (6), 59EGN (8) y 60PBL (9)— están en la hoja y NO están en la base. Las de
// 01TPS y 16PQA, que sí figuran en el catálogo estático, llegaron sin problema.
//
// Es el mismo agujero que la Parte N del plan ya documentó —«26ALC (467,5 kg), 56PZA (665,6) y
// 59EGN (1.003) se perdieron así»—, tapado en el CLIENTE (`sheetsSantiago.ts` dejó de descartar una
// tienda por no conocerla) y todavía abierto en el servidor.
//
// ── LA FUENTE CORRECTA ────────────────────────────────────────────────────────────────────────
//
// La tabla `tiendas`, que es la que Config escribe y la única que conoce a todas. El criterio de
// zona es el MISMO que usa Bodega (`esSectorRegiones`), para que las dos puntas no puedan discrepar.

import { esSectorRegiones } from '@/features/despacho/regiones/data/tiendas';

/** Lo único que hace falta de cada tienda para repartir. */
export interface TiendaDelCatalogo {
  codigo?: unknown;
  sector_comuna?: unknown;
  activo?: unknown;
}

export interface Clasificador {
  esNacional: (cod: string) => boolean;
  esSantiago: (cod: string) => boolean;
  /** Cuántas tiendas conoce. 0 = la consulta falló; quien llama decide qué hacer con eso. */
  conocidas: number;
}

/**
 * Arma las dos preguntas a partir del catálogo de la base. PURA.
 *
 * Una tienda INACTIVA sigue clasificando: sus filas históricas tienen que poder sincronizarse. Lo
 * que decide si se despacha hoy es el calendario, no esto.
 *
 * `respaldo` son los dos catálogos del navegador. Se consultan DESPUÉS de la base, nunca antes: si
 * la base dice algo de una tienda, manda la base. Están para que una caída de la consulta no
 * empeore lo que ya funcionaba.
 */
export function clasificadorDeTiendas(
  filas: readonly TiendaDelCatalogo[] | null | undefined,
  respaldo: { esNacional: (cod: string) => boolean; esSantiago: (cod: string) => boolean },
): Clasificador {
  const region = new Set<string>();
  const santiago = new Set<string>();
  for (const f of filas ?? []) {
    const cod = String(f?.codigo ?? '').trim().toUpperCase();
    if (!cod) continue;
    if (esSectorRegiones(f?.sector_comuna == null ? null : String(f.sector_comuna))) region.add(cod);
    else santiago.add(cod);
  }
  const norm = (cod: string) => String(cod ?? '').trim().toUpperCase();
  return {
    conocidas: region.size + santiago.size,
    esNacional: cod => {
      const c = norm(cod);
      if (region.has(c)) return true;
      if (santiago.has(c)) return false;   // la base ya dijo que NO es de región
      return respaldo.esNacional(c);
    },
    esSantiago: cod => {
      const c = norm(cod);
      if (santiago.has(c)) return true;
      if (region.has(c)) return false;
      return respaldo.esSantiago(c);
    },
  };
}
