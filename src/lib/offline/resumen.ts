import { listar } from './almacen';
import { pendientesDeEnvio, bloqueados } from './resultado';
import type { ModuloOffline } from './tipos';

/**
 * [PWA · fase 4] Cuánto trabajo sin enviar hay en este dispositivo, sumando los tres módulos.
 *
 * Hasta ahora cada pantalla contaba lo suyo, así que el chofer veía su contador en el panel del
 * conductor y nada más. Quien confirma una recepción en tienda y se va a otra pantalla no tenía
 * forma de saber que algo seguía colgando.
 */

const MODULOS: ModuloOffline[] = ['picking', 'conductor', 'recepcion'];

export interface ResumenOffline {
  /** Lo que todavía se va a intentar mandar. */
  pendientes: number;
  /** Lo que el servidor rechazó de forma definitiva: no se reintenta y alguien tiene que rehacerlo. */
  bloqueadas: number;
}

/**
 * Pregunta por los tres módulos siempre, aunque alguno todavía no escriba nada en la cola: `listar`
 * devuelve vacío y no cuesta nada. Así el contador empieza a incluir cada módulo apenas ese módulo
 * empieza a encolar, sin tener que tocar esto.
 */
export async function resumenOffline(): Promise<ResumenOffline> {
  const porModulo = await Promise.all(MODULOS.map(m => listar(m)));
  const todos = porModulo.flat();
  return {
    pendientes: pendientesDeEnvio(todos).length,
    bloqueadas: bloqueados(todos).length,
  };
}
