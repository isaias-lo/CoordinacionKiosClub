/**
 * ¿Corresponde sincronizar Sheets→BD al abrir esta pestaña del panel Estado/Registros?
 *
 * Antes el panel solo sincronizaba cuando la tabla estaba VACÍA (`loaded.length === 0`). Como
 * siempre hay data histórica, el auto-sync nunca se disparaba y los despachos de días nuevos NO
 * aparecían hasta que alguien tocaba "⇅ Sheets" a mano (bug: el despacho del 04-05/08 estaba en
 * el Sheet pero no en la app). Ahora se sincroniza SIEMPRE al abrir, una vez por sesión y por
 * pestaña, para reflejar lo último del Sheet sin depender de un clic manual.
 *
 * Solo pestañas de despacho (RM/Regiones): 'recepcion' (viene del flujo de tienda, no del Sheet
 * de despacho) e 'historial' (no es tabla sincronizable) quedan fuera. Puro y testeable.
 */
export function shouldSyncTab(tab: string, alreadySynced: boolean): boolean {
  if (alreadySynced) return false;
  return tab !== 'recepcion' && tab !== 'historial';
}
