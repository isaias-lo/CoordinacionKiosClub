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

/**
 * La FECHA DE DESPACHO que usa Bodega al registrar: la elegida, o mañana por defecto.
 *
 * ── POR QUÉ VIVE ACÁ Y NO EN CADA MODAL ────────────────────────────────────────────────────────
 *
 * De esta fecha sale el `stamp` del id de cada fila (`${orden}${cod}${stamp}${prefijo}`), y de la
 * igualdad de ese id depende que registrar UNA tienda y después el día entero no duplique nada:
 * `api/sheets-write` solo agrega los ids que la hoja no tiene.
 *
 * Si el botón por tienda y el modal del día calcularan "mañana" cada uno por su lado, bastaría que
 * uno corriera a las 23:59 y el otro a las 00:01 para que los ids no coincidieran y la tienda
 * saliera dos veces. Por eso hay UNA sola función, y los dos la llaman.
 *
 * El "+1 día" se hace sobre el día del CD, no sobre el reloj del equipo, por la misma razón que
 * `fechaISOLocal`.
 */
export function fechaDespachoBodega(elegida?: string | null, hoy?: Date): string {
  if (elegida) return elegida;
  const [y, m, d] = fechaISOLocal(hoy).split('-').map(Number);
  // `Date.UTC` + getUTC* para que el +1 no dependa de la zona del equipo: acá ya se trabaja con
  // números de calendario, no con un instante.
  const manana = new Date(Date.UTC(y, m - 1, d + 1));
  return `${manana.getUTCFullYear()}-${String(manana.getUTCMonth() + 1).padStart(2, '0')}-${String(manana.getUTCDate()).padStart(2, '0')}`;
}
