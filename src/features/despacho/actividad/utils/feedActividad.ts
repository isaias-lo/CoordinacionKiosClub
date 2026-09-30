// Qué se muestra en el feed de Actividad y qué no. Puro y testeable.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────────────────────────
//
// El 29/09 el coordinador abrió Actividad y vio UN evento —«Steven Plaza ingresó P1 en 01TPS»—
// cuando ese día hubo 672 eventos de nueve personas. No se perdió nada: lo que falla es la ventana.
//
// La pantalla pedía `/api/actividad?fecha=…` SIN `limit`, y la API topa en 200 ordenando por
// `created_at` descendente. Medido sobre esos 200 del 29/09:
//
//     merge_descarte   136   ← el 68% de la pantalla
//     registrar_item    45
//     eliminar_item     13
//     sumar              5
//     unificar           1
//
// Dos daños, y el segundo es peor que el primero:
//
//   · Dos de cada tres filas eran `merge_descarte`, que ni siquiera es trabajo de una persona. El
//     propio comentario de `lib/actividad.ts` lo dice: «No es una acción de la persona — es el
//     sistema contándose a sí mismo».
//   · Con el cupo gastado en eso, los 200 solo alcanzaban hasta las 14:10. Los 472 eventos de la
//     mañana quedaban afuera SIN AVISO: la lista simplemente terminaba, como si el día empezara
//     a media tarde.
//
// Y un tercer efecto derivado: los desplegables de usuario y tienda se arman con las filas ya
// cargadas, así que filtrar por alguien que trabajó temprano era imposible — no estaba en la lista.
//
// ── LA REGLA ───────────────────────────────────────────────────────────────────────────────────
//
// El feed responde «quién hizo qué». Una acción que nadie hizo no va ahí por defecto, pero TAMPOCO
// se borra: se puede pedir aparte, porque para diagnosticar el merge es justo lo que hace falta.

import type { AccionActividad, ActividadRow } from '@/lib/actividad';

/**
 * Las acciones que registra el SISTEMA, no una persona.
 *
 * Se listan por nombre y no por descarte: así, una acción nueva de persona entra al feed sola, y
 * una de diagnóstico hay que agregarla acá a propósito. El olvido barato es el correcto.
 */
export const ACCIONES_DIAGNOSTICO: readonly string[] = ['merge_descarte'];

export function esDiagnostico(accion: string): boolean {
  return ACCIONES_DIAGNOSTICO.includes(accion);
}

/** Las acciones de persona: lo que el feed muestra por defecto. */
export function esTrabajoDePersona(accion: string): boolean {
  return !esDiagnostico(accion);
}

/**
 * Separa el feed en las dos cosas que mezclaba.
 *
 * Devolver las dos —y no filtrar y tirar— es lo que permite ofrecer el interruptor sin volver a
 * pedirle nada al servidor.
 */
export function partirFeed(rows: ActividadRow[]): {
  trabajo: ActividadRow[];
  diagnostico: ActividadRow[];
} {
  const trabajo: ActividadRow[] = [];
  const diagnostico: ActividadRow[] = [];
  for (const r of rows) (esDiagnostico(r.accion) ? diagnostico : trabajo).push(r);
  return { trabajo, diagnostico };
}

/**
 * Las opciones de los desplegables.
 *
 * Salen SIEMPRE de todas las filas cargadas, incluidas las de diagnóstico: si alguien solo aparece
 * en un `merge_descarte`, su nombre tiene que poder elegirse igual — si no, la persona no existe
 * para el filtro y no hay forma de llegar a ella.
 */
export function opcionesDeFiltro(rows: ActividadRow[]): { usuarios: string[]; tiendas: string[] } {
  const usuarios = new Set<string>();
  const tiendas  = new Set<string>();
  for (const r of rows) {
    if (r.actor_name) usuarios.add(r.actor_name);
    if (r.tienda_cod) tiendas.add(r.tienda_cod);
  }
  return {
    usuarios: [...usuarios].sort((a, b) => a.localeCompare(b, 'es')),
    tiendas:  [...tiendas].sort((a, b) => a.localeCompare(b, 'es')),
  };
}

/**
 * El aviso de que la lista quedó cortada, o `null` si está completa.
 *
 * Existe porque el modo de falla no era mostrar de menos: era mostrar de menos SIN DECIRLO. Una
 * lista que termina sola se lee como «no hubo más», que es una afirmación distinta y falsa.
 */
export function avisoDeCorte(mostradas: number, total: number | null): string | null {
  if (total === null || total === undefined || total <= mostradas) return null;
  const faltan = total - mostradas;
  return `Se muestran los ${mostradas} eventos más recientes de ${total}. `
       + `Faltan ${faltan} más arriba en el día — filtra por fuente, usuario o tienda para verlos.`;
}

/** Aplica los filtros que se resuelven en el cliente. */
export function filtrarVisibles(
  rows: ActividadRow[],
  { usuario, tienda, verDiagnostico }: { usuario: string; tienda: string; verDiagnostico: boolean },
): ActividadRow[] {
  return rows.filter(r =>
    (verDiagnostico || esTrabajoDePersona(r.accion)) &&
    (!usuario || r.actor_name === usuario) &&
    (!tienda  || r.tienda_cod === tienda));
}

/** Cuántas acciones hizo cada persona, para la franja de resumen. Orden: la que más, primero. */
export function porPersona(rows: ActividadRow[]): { nombre: string; n: number }[] {
  const cuenta = new Map<string, number>();
  for (const r of rows) {
    if (!esTrabajoDePersona(r.accion)) continue;
    const n = r.actor_name ?? 'Sin nombre';
    cuenta.set(n, (cuenta.get(n) ?? 0) + 1);
  }
  return [...cuenta].map(([nombre, n]) => ({ nombre, n }))
    .sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, 'es'));
}

/** Las acciones que la API debe traer, según se quiera o no el diagnóstico. */
export function accionesPedidas(
  todas: readonly AccionActividad[], verDiagnostico: boolean,
): string[] {
  return verDiagnostico ? [...todas] : todas.filter(esTrabajoDePersona);
}
