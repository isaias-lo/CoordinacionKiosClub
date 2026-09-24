// Qué pestañas de Bodega puede abrir cada persona. Puro y testeable.
//
// Reportado el 24/09: los supervisores de Picking entran a Bodega y, al tocar "RM / Costa", el
// sistema los saca del módulo y los deja en Picking.
//
// No es un error de navegación: es el permiso. Los cuatro usuarios con rol `supervisor-picking`
// tienen exactamente estas rutas:
//
//     ["/picking", "/perfil", "/despacho/regiones", "/despacho/congelados"]
//
// O sea: Bodega Nacional sí, RM/Costa no. Y el middleware, ante una ruta prohibida, no dice "no
// tenés acceso": redirige a la PÁGINA INICIAL del rol, que para ellos es `/picking`. De ahí que
// tocar una pestaña los saque del módulo entero.
//
// Lo mismo le pasa a "Actividad" (`/despacho/actividad`), que tampoco está en esa lista.
//
// La barra de pestañas era una constante: se dibujaban las tres siempre, sin mirar permisos. Una
// pestaña que expulsa es peor que una pestaña que no está — la persona no hizo nada malo y termina
// en otro módulo sin entender por qué. Acá se filtran antes de dibujarlas.
//
// Ojo: esto NO es la seguridad. La autoridad sigue siendo el middleware, que ya bloquea la ruta.
// Esto es para que nadie toque una puerta que está cerrada.

import { isPathAllowed } from '@/config/routes';

/** Lo mínimo que hace falta saber de una pestaña para decidir si se muestra. */
export interface TabConRuta { href: string }

/**
 * Las pestañas que esta persona puede abrir.
 *
 * `allowedPaths` vacío o ausente = todavía no se sabe (el perfil no cargó). Ahí se devuelven
 * TODAS: esconder pestañas por falta de dato dejaría a alguien sin su pantalla por un parpadeo,
 * y el middleware sigue protegiendo la ruta igual. El caso que se arregla es el otro — saber que
 * no tiene acceso y dibujar la pestaña lo mismo.
 */
export function tabsPermitidos<T extends TabConRuta>(tabs: readonly T[], allowedPaths?: readonly string[] | null): T[] {
  if (!allowedPaths || allowedPaths.length === 0) return [...tabs];
  return tabs.filter(t => isPathAllowed([...allowedPaths], t.href));
}
