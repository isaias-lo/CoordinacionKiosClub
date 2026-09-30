import { listarTodos } from './almacen';
import { pendientesDeEnvio, bloqueados } from './resultado';

/**
 * [PWA · fase 4] Cuánto trabajo sin enviar hay en este dispositivo, sumando los tres módulos.
 *
 * Hasta ahora cada pantalla contaba lo suyo, así que el chofer veía su contador en el panel del
 * conductor y nada más. Quien confirma una recepción en tienda y se va a otra pantalla no tenía
 * forma de saber que algo seguía colgando.
 */

export interface ResumenOffline {
  /** Lo que todavía se va a intentar mandar. */
  pendientes: number;
  /** Lo que el servidor rechazó de forma definitiva: no se reintenta y alguien tiene que rehacerlo. */
  bloqueadas: number;
}

/**
 * Cuenta la cola entera sin mirar de qué módulo es cada ítem. Así un módulo que empiece a encolar
 * mañana entra en el contador sin tocar esto, y la lectura es una sola aunque los módulos sean
 * tres — ver `listarTodos` en `almacen.ts` para por qué eso importa.
 */
export async function resumenOffline(): Promise<ResumenOffline> {
  const todos = await listarTodos();
  return {
    pendientes: pendientesDeEnvio(todos).length,
    bloqueadas: bloqueados(todos).length,
  };
}
