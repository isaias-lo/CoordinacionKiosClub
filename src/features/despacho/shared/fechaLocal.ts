import { fechaChile, fechaChileDe } from '@/lib/fechaChile';

/**
 * Fecha de HOY en 'YYYY-MM-DD' según el día del **CD (America/Santiago)**.
 *
 * Nació como "día local del equipo" para arreglar el bug de los slots de Bodega: con el día UTC,
 * pasadas las ~20:00 en Chile la fecha ya rodaba a "mañana", así que un slot creado al tocar
 * "Agregar" quedaba guardado bajo OTRA fecha que la que leen el loader, el sync y el semáforo — el
 * ítem "desaparecía" y el backfill lo revivía como borrador.
 *
 * Ahora la zona es **fija** (no la del equipo). El día del reloj del equipo funcionaba en el CD,
 * pero en el servidor ese reloj es UTC: la misma función devolvía días distintos en el servidor y
 * en el navegador, que es exactamente el error de hidratación de React (#418) y el "Hoy" corrido de
 * Picking › Actividad. Con zona fija, servidor y cliente siempre dicen el mismo día.
 *
 * Acepta un `Date` para poder testearla de forma determinista.
 */
export function fechaISOLocal(d?: Date): string {
  return d ? fechaChileDe(d) : fechaChile();
}
