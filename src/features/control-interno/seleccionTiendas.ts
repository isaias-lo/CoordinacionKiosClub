// La selección múltiple de Config. Tiendas. Puro y testeable.
//
// El caso incómodo que este módulo existe para resolver: la selección se guarda por CÓDIGO, pero la
// tabla muestra una lista filtrada. Si alguien marca tres tiendas, escribe algo en el buscador y
// aprieta "todas", la casilla del encabezado solo puede hablar de lo que se ve.
//
// La regla: "todas" opera SOLO sobre lo visible y nunca descarta en silencio lo que quedó marcado
// fuera del filtro. Lo contrario —vaciar la selección entera— borraría elecciones que la persona no
// ve y no recuerda haber deshecho.

/** ¿Están marcadas todas las visibles? Con cero visibles es `false`: no hay nada que marcar. */
export function todasMarcadas(seleccion: Iterable<string>, visibles: string[]): boolean {
  if (visibles.length === 0) return false;
  const sel = new Set(seleccion);
  return visibles.every(c => sel.has(c));
}

/**
 * La casilla del encabezado: si ya están todas las visibles, las quita; si no, las agrega.
 *
 * Lo marcado que el filtro esconde se conserva en los dos sentidos. Devuelve el orden de la
 * selección previa primero, para que quitar y volver a marcar no reordene los códigos del diálogo.
 */
export function alternarTodas(seleccion: Iterable<string>, visibles: string[]): string[] {
  const previa = [...seleccion];
  if (todasMarcadas(previa, visibles)) {
    const fuera = new Set(visibles);
    return previa.filter(c => !fuera.has(c));
  }
  const yaEstan = new Set(previa);
  return previa.concat(visibles.filter(c => !yaEstan.has(c)));
}

/** Marca o desmarca una sola tienda, conservando el orden del resto. */
export function alternarUna(seleccion: Iterable<string>, codigo: string): string[] {
  const previa = [...seleccion];
  return previa.includes(codigo) ? previa.filter(c => c !== codigo) : previa.concat([codigo]);
}

/** "3 tiendas seleccionadas" — concuerda en singular. */
export function textoSeleccion(n: number): string {
  return n === 1 ? '1 tienda seleccionada' : `${n} tiendas seleccionadas`;
}

/**
 * Cuántas de las marcadas quedan fuera del filtro actual.
 *
 * Se muestra en la barra: actuar sobre tiendas que no están en pantalla es legítimo —se marcaron a
 * propósito— pero tiene que decirse, o el conteo de la barra parece un error.
 */
export function marcadasOcultas(seleccion: Iterable<string>, visibles: string[]): number {
  const aLaVista = new Set(visibles);
  return [...seleccion].filter(c => !aLaVista.has(c)).length;
}
