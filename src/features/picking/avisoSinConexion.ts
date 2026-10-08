// Qué dice el aviso de Picking cuando se corta la señal. Puro y testeable.
//
// Antes decía «los cambios no se están guardando», y no era cierto: agregar pallets e imprimir
// quedan en la cola de este equipo (picking-offline-queue.ts) y se envían solos al volver la señal.
// Quien lo leía dejaba de trabajar, o repetía el trabajo al reconectar.

export function textoSinConexion(pendientes: number): string {
  const base = 'Sin conexión: los pallets y las impresiones se guardan en este equipo y se envían al volver la señal';
  if (pendientes <= 0) return base;
  return `${base} · ${pendientes} pendiente${pendientes !== 1 ? 's' : ''}`;
}
