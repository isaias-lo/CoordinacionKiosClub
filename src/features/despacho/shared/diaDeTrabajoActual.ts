// El día de trabajo de ESTA carga de página. La parte que mira el navegador; la decisión es pura
// y vive en `diaDeTrabajo.ts`.
//
// ── POR QUÉ SE RESUELVE UNA SOLA VEZ, AL CARGAR EL MÓDULO ─────────────────────────────────────
//
// En Bodega el día no es un dato más: fija las claves de `localStorage`, la fila del estado
// compartido, la lista de tiendas del calendario, la consulta de slots y la fecha con que se
// registra. Si una parte se fijara al cargar y otra pudiera cambiar en caliente, la pantalla
// quedaría a mitad de camino entre dos días — que es, exactamente, el bug de las tiendas
// fantasma del 12/10.
//
// Por eso cambiar de día RECARGA la página (ver `urlConDia`): así todas esas piezas se vuelven a
// fijar juntas, desde el mismo valor, y no hay estados intermedios.

import { fechaChile } from '@/lib/fechaChile';
import { diaPedidoEnURL, resolverDiaDeTrabajo } from './diaDeTrabajo';

/**
 * El día que esta pantalla trabaja: el `?dia=` de la URL si es admisible, si no hoy.
 *
 * En el servidor no hay URL que leer y devuelve hoy. Las pantallas de Bodega se montan solo en el
 * navegador (`ssr: false`), así que el valor que termina usándose es siempre el del cliente.
 */
export function diaDeTrabajoActual(): string {
  const hoy = fechaChile();
  if (typeof window === 'undefined') return hoy;
  return resolverDiaDeTrabajo(diaPedidoEnURL(window.location.search), hoy);
}

/**
 * ¿El día lo ELIGIÓ alguien, o es el que había?
 *
 * La diferencia importa porque las dos señales son opuestas y no pueden salir juntas:
 *
 *   · día elegido  → banda «estás trabajando el martes 13», que es información, no alarma.
 *   · día heredado → la pantalla quedó abierta de un día para otro y hay que avisarlo
 *                    (`AvisoDiaViejo`, #722), que sí es alarma.
 *
 * Sin esta distinción, abrir el 13 a propósito dispararía el aviso de pestaña vieja, y silenciar
 * ese aviso para no molestar dejaría sin protección el caso que lo motivó.
 */
export function diaDeTrabajoEsDeliberado(): boolean {
  if (typeof window === 'undefined') return false;
  const pedido = diaPedidoEnURL(window.location.search);
  return !!pedido && resolverDiaDeTrabajo(pedido, fechaChile()) === pedido.trim();
}
