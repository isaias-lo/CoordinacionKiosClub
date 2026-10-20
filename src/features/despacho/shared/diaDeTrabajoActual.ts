// El día de trabajo de ESTA carga de página. La parte que mira el navegador; la decisión es pura
// y vive en `diaDeTrabajo.ts` (`decidirDiaDeTrabajo`).
//
// ── POR QUÉ SE RESUELVE UNA SOLA VEZ ──────────────────────────────────────────────────────────
//
// En Bodega el día no es un dato más: fija las claves de `localStorage`, la fila del estado
// compartido, la lista de tiendas del calendario, la consulta de slots y la fecha con que se
// registra. Si una parte se fijara al cargar y otra pudiera cambiar en caliente, la pantalla
// quedaría a mitad de camino entre dos días — que es, exactamente, el bug de las tiendas
// fantasma del 12 y del 19/10.
//
// ── POR QUÉ NO ALCANZABA CON FIJARLO «AL CARGAR EL MÓDULO» ────────────────────────────────────
//
// Acá decía que el día se resolvía una sola vez, al cargar el módulo. La intención era correcta;
// el supuesto, no: «al cargar el módulo» NO es un solo instante. Seis módulos llaman a esta
// función a nivel de módulo, y se evalúan en momentos distintos —la raíz primero, los chunks
// `dynamic({ssr:false})` de cada bodega recién al entrar—, así que cada uno leía la URL que
// hubiera en SU momento. Entre uno y otro, una navegación interna cambia la URL sin recargar
// nada, y los días se parten.
//
// Ahora el día lo fija la PRIMERA pieza que pregunta y lo heredan todas las demás, se evalúen
// cuando se evalúen. Si la URL pide otro día, no se cambia en caliente: se recarga la página,
// que es lo que `urlConDia` ya venía prometiendo para el botón de la banda.

import { fechaChile } from '@/lib/fechaChile';
import { decidirDiaDeTrabajo, diaPedidoEnURL, type DiaFijado } from './diaDeTrabajo';

let fijado: DiaFijado | null = null;
let recargaPedida = false;

/** Solo para los tests: devuelve el módulo al estado de una carga nueva. */
export function __reiniciarDiaFijado(): void {
  fijado = null;
  recargaPedida = false;
}

/** Lo que de verdad hace el trabajo. Las dos funciones públicas pasan por acá. */
function resolver(): string {
  const hoy = fechaChile();
  if (typeof window === 'undefined') return hoy;

  const decision = decidirDiaDeTrabajo(fijado, diaPedidoEnURL(window.location.search), hoy);
  if (decision.fijar) fijado = decision.fijar;

  if (decision.recargar && !recargaPedida) {
    recargaPedida = true;
    // Fuera del render: esta función se llama al evaluar un módulo, o sea mientras React está
    // montando el árbol. Recargar ahí deja la pantalla a medias. Un turno del event loop basta
    // para que el montaje termine antes.
    setTimeout(() => window.location.reload(), 0);
  }

  return decision.dia;
}

/**
 * El día que esta pantalla trabaja: el `?dia=` de la URL si es admisible, si no hoy.
 *
 * En el servidor no hay URL que leer y devuelve hoy. Las pantallas de Bodega se montan solo en el
 * navegador (`ssr: false`), así que el valor que termina usándose es siempre el del cliente.
 */
export function diaDeTrabajoActual(): string {
  return resolver();
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
 *
 * Sale del MISMO valor fijado que `diaDeTrabajoActual`, no de la URL en vivo: si no, la banda
 * podría hablar de un día y la pantalla escribir en otro.
 */
export function diaDeTrabajoEsDeliberado(): boolean {
  if (typeof window === 'undefined') return false;
  resolver();
  return !!fijado && fijado.pedido !== null && fijado.pedido === fijado.dia;
}
