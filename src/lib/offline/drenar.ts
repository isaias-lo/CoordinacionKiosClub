import type { ItemCola } from './tipos';
import { siguienteEstado, pendientesDeEnvio, type Veredicto } from './resultado';

/**
 * Lo que cada módulo pone de su parte: mandar UN ítem y decir cómo le fue.
 *
 * Puede devolver además un `item` con el progreso que alcanzó a hacer, y ese es el que se guarda
 * si hay que reintentar. Hace falta para los envíos de varios pasos: el conductor sube las fotos
 * una por una y recién después manda el PATCH, así que si el PATCH falla, las fotos que YA se
 * subieron tienen que quedar anotadas. Sin esto, cada reintento las volvería a subir enteras,
 * gastando los datos del teléfono de alguien que está en ruta.
 */
export type Enviar<P> = (item: ItemCola<P>) => Promise<{
  veredicto: Veredicto;
  mensaje?: string;
  item?: ItemCola<P>;
}>;

/** El almacén, inyectado para poder probar el drenado sin IndexedDB. */
export interface AlmacenCola<P> {
  guardar: (item: ItemCola<P>) => Promise<boolean>;
  eliminar: (id: string) => Promise<void>;
}

export interface ResultadoDrenado {
  enviados: number;
  /** Cuántos quedaron marcados como definitivamente rechazados EN ESTA pasada. */
  bloqueados: number;
  /** Cuántos siguen esperando otra oportunidad (sin señal, servidor caído). */
  pendientes: number;
}

/**
 * Intenta enviar la cola de un módulo, en orden y de a uno.
 *
 * De a uno y en serie a propósito: en picking una impresión depende de los pallets agregados antes,
 * y en paralelo llegarían en cualquier orden. Además, mandar veinte peticiones juntas apenas vuelve
 * la señal es la mejor forma de que se caigan todas.
 *
 * Los ítems ya bloqueados ni se tocan: reintentarlos gasta batería y datos para volver a recibir el
 * mismo rechazo.
 */
export async function drenar<P>(
  items: ItemCola<P>[],
  enviar: Enviar<P>,
  almacen: AlmacenCola<P>,
): Promise<ResultadoDrenado> {
  let enviados = 0;
  let bloqueados = 0;
  let pendientes = 0;

  for (const item of pendientesDeEnvio(items)) {
    let veredicto: Veredicto;
    let mensaje: string | undefined;
    // El ítem sobre el que se aplica el veredicto: el que devolvió el envío si trae progreso
    // guardado, o el original.
    let avanzado: ItemCola<P> = item;
    try {
      const r = await enviar(item);
      veredicto = r.veredicto;
      mensaje   = r.mensaje;
      if (r.item) avanzado = r.item;
    } catch (e) {
      // Una excepción acá es la señal cortada, no un rechazo: `fetch` tira cuando no hay red.
      // Tratarla como definitiva borraría justo el trabajo que la cola existe para salvar.
      veredicto = 'reintentar';
      mensaje   = e instanceof Error ? e.message : 'sin conexión';
    }

    const accion = siguienteEstado(avanzado, veredicto, mensaje);
    if (accion.tipo === 'eliminar') {
      await almacen.eliminar(item.id);
      enviados++;
    } else {
      await almacen.guardar(accion.item);
      if (accion.item.bloqueado) bloqueados++;
      else pendientes++;
    }
  }

  return { enviados, bloqueados, pendientes };
}
