// Cuándo se pliega la cabecera de la lista de tiendas en el teléfono. Puro y testeable.
//
// En un teléfono de ~650 px de alto, las fechas, el buscador, el resumen y los filtros se comían
// media pantalla y el Mosaico quedaba en la otra mitad (Isaias, 6 oct 2026). Al bajar por la lista,
// las fechas y el buscador se esconden; vuelven al llegar arriba. El lector de la handheld no
// depende del buscador visible: escucha la página entera (`useLectorBodega`).
//
// Por qué así y no «al subir un poco»: esconder la cabecera agranda la lista, y si la lista es
// corta el navegador recorta el desplazamiento y parece que se subió. Con la regla de abajo eso
// no puede pasar: solo se pliega si, ya plegada, todavía sobra lista para desplazar.

export interface EstadoPliegue {
  /** Desplazamiento actual de la lista. */
  arriba: number;
  /** Cuánto se puede desplazar la lista (scrollHeight − clientHeight) con la cabecera visible. */
  sobra: number;
  /** Alto de lo que se esconde. */
  altoCabecera: number;
  plegada: boolean;
  /** Hay algo escrito en el buscador o tiene el foco: no se esconde. */
  ocupada: boolean;
}

export const UMBRAL_PLEGAR = 48;
export const UMBRAL_DESPLEGAR = 8;
/** Lo que tiene que sobrar después de plegar para que el recorte no la vuelva a abrir. */
export const MARGEN_SOBRA = 64;

export function debePlegarse(e: EstadoPliegue): boolean {
  if (e.ocupada) return false;
  if (e.plegada) return e.arriba > UMBRAL_DESPLEGAR;
  return e.arriba > UMBRAL_PLEGAR && e.sobra > e.altoCabecera + MARGEN_SOBRA;
}
