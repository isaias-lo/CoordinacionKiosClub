// Bajar al tablero la carga que Bodega registró, sin inventar ceros. Puro y testeable.
//
// El tablero guarda, junto a cada tienda, cuántos pallets/bultos/chocolates lleva. Eso es una COPIA
// de `despacho_sesion`: nadie la edita a mano ("Los conteos del Enrutador son SOLO-LECTURA (se
// definen en Bodega)"). Un efecto la refresca cada vez que cambia `calT`.
//
// El problema es de qué está hecho `calT` al principio. Se arma del CALENDARIO, y el calendario no
// tiene cantidades: cada tienda entra en `{ on: true, p: 0, b: 0, c: 0, ch: 0 }`. Las cantidades
// llegan después, por `fetchCounts` —que sale con 1,5 s de retraso— y por Realtime.
//
// El tablero, en cambio, se lee de `shared_session_state` de una sola vez y con sus conteos buenos.
// Así que hay una ventana —desde que aparece el calendario hasta que llegan los conteos— en la que
// el efecto pisaba 3P con 0P. Y el push del tablero espera 800 ms, menos que esos 1,5 s: el cero
// alcanzaba a guardarse y a propagarse a los demás equipos antes de corregirse. Eso es "palets que
// aparecen en 0P de un momento a otro".
//
// La regla que faltaba es distinguir dos ceros que no son lo mismo:
//
//   · "Bodega dice que ahora hay cero"  → hay que aplicarlo (alguien borró la carga).
//   · "todavía no sé cuánto hay"        → no se toca nada.
//
// `despacho_sesion` responde esa pregunta: si llegó una fila para esa tienda, el cero es un dato;
// si no llegó ninguna, es ignorancia.

/** Lo que el tablero guarda de cada tienda. */
export interface TiendaEnCamion {
  c: string;
  p: number;
  b: number;
  ch?: number;
}

/** La entrada de `calT` de la que se copian las cantidades. */
export interface CargaConocida {
  p: number;
  b: number;
  ch?: number;
}

/**
 * Refresca la carga del tablero desde `calT`.
 *
 * `reporto(cod)` dice si `despacho_sesion` ya habló de esa tienda en este equipo. Con `false`, un
 * cero NO se aplica: no se sabe todavía, y el número que el tablero ya tiene vale más que una
 * suposición.
 *
 * Devuelve el MISMO objeto si no hubo cambios, para no disparar un render (ni un push) de más.
 */
export function refrescarCargaTablero<T extends TiendaEnCamion>(
  asignaciones: Record<string, T[]>,
  calT: Record<string, CargaConocida | undefined>,
  reporto: (cod: string) => boolean,
): Record<string, T[]> {
  let cambio = false;
  const next: Record<string, T[]> = {};

  for (const [patente, tiendas] of Object.entries(asignaciones ?? {})) {
    next[patente] = (tiendas ?? []).map(s => {
      const nueva = calT[s.c];
      if (!nueva) return s;                        // la tienda no está en calT: no hay qué copiar
      const ch = nueva.ch ?? 0;
      if (nueva.p === s.p && nueva.b === s.b && ch === (s.ch ?? 0)) return s;
      // Cero sin dato = "no sé", no "no hay". Ver la cabecera.
      if (nueva.p === 0 && nueva.b === 0 && ch === 0 && !reporto(s.c)) return s;
      cambio = true;
      return { ...s, p: nueva.p, b: nueva.b, ch };
    });
  }

  return cambio ? next : asignaciones;
}
