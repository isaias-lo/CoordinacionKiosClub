// Qué pestañas de Picking trabajan sobre las tiendas seleccionadas. Puro y testeable.
//
// Existe por M-08: el panel de tiendas (unos 290 px) seguía ocupando ancho en Calendario,
// Estadísticas, Actividad, Historial y Config, que no dependen de la selección. En Calendario eso
// dejaba el grid semanal cortado — la columna del viernes partida contra el borde.
//
// La lista NO se desmonta al colapsar: se le pone ancho 0. Desmontarla perdería el scroll y el
// estado de la lista cada vez que alguien pasa por otra pestaña.

/** Las únicas dos pestañas donde la selección de tiendas decide lo que se ve. */
const CON_SELECTOR = new Set(['monitoreo', 'congelados']);

export function usaSelectorDeTiendas(tab: string): boolean {
  return CON_SELECTOR.has(tab);
}

// ─── Tiendas elegidas que la lista no muestra ────────────────────────────────────────────────
//
// 14/10/2026, Kamila quedó «atrapada» en 59EGN: estaba elegida, pero la lista de Seco solo pinta las
// tiendas del calendario de HOY de esa pestaña. EGN había despachado seco el día anterior y hoy solo
// tenía congelados, así que no aparecía en ninguna fila que se pudiera destocar, y el selector de la
// planilla solo deja saltar entre las elegidas o volver a esa misma lista. Sin salida.
//
// Regla: una tienda elegida SIEMPRE tiene que verse en la lista para poder quitarla.

/** Las elegidas que no están en la lista que se está mostrando, en el orden en que se eligieron. */
export function elegidasFueraDeLista(elegidas: string[], lista: { cod: string }[]): string[] {
  const enLista = new Set(lista.map(s => s.cod));
  return elegidas.filter(c => !enLista.has(c));
}

/**
 * ¿Hay que soltar las tiendas elegidas porque ya es otro día? La selección pertenece al día en que
 * se hizo: con la pestaña abierta de un día para otro, las de ayer no son las de hoy. Sin tiendas
 * elegidas no hay nada que soltar (y no vale la pena avisar).
 */
export function seleccionVencida(diaSeleccion: string, hoy: string, elegidas: number): boolean {
  return elegidas > 0 && diaSeleccion !== hoy;
}
