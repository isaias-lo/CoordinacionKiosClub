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
