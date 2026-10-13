// La pantalla de Bodega quedó abierta de un día para otro. PURO.
//
// ── EL CASO DEL 12/10/2026 ────────────────────────────────────────────────────────────────────
//
// En Manual/Cal de Bodega, filtrando Regiones, aparecieron 14 tiendas el lunes. Ocho eran reales
// —19P + 1B, exactamente los «PESADOS: 20 de 20» de la pantalla— y SEIS no tenían una sola unidad
// en la balanza ese día:
//
//     24SPP 1P · 27MCH 4P·2B · 31TLC 3P · 36CHL 3P·2B · 38SP2 3P · 46TRE 5P·2B
//
// Son 19 pallets y 6 bultos fantasma, y calzan tienda por tienda con la carga del VIERNES 9.
//
// ── LAS DOS LÍNEAS QUE NO ESTÁN DE ACUERDO ────────────────────────────────────────────────────
//
//     const SESSION_DATE = fechaChile();        // constante de MÓDULO: se fija al cargar la página
//     const fecha = fechaCarga ?? todayISO();   // fecha FRESCA: se calcula al empujar
//
// Una pestaña abierta desde el viernes conserva los ítems del viernes —su `localStorage` sigue en
// `regionesState_2026-10-09` y su blob es el del viernes— pero `pushCounts` los escribe con la
// fecha de HOY. Y nada detecta que el día cambió: el único control que existe (`AppContext`)
// protege el merge del blob, no el push.
//
// RM/Costa estaba limpio ese día —22 tiendas, 22 con slots, cero fantasmas—, así que fue un equipo
// puntual. Pero puede pasarle a cualquiera que deje la pantalla abierta.
//
// ── POR QUÉ LA CARGA VA AL DÍA DE LA SESIÓN Y NO AL DE HOY ────────────────────────────────────
//
// La pantalla cargó el estado del viernes y muestra las tiendas del viernes: lo que haya ahí
// pertenece al viernes. Escribirlo en el lunes es inventar carga que nadie armó. Y al revés —no
// escribir nada— perdería el trabajo de quien siga usando esa pestaña.
//
// Así que la carga se escribe en SU día, y a la persona se le avisa que recargue para pasar al
// día nuevo. Congelados ya trabajaba así (`pushCounts(..., fechaTrabajo)`); Bodega no.

/** `true` si la pantalla se cargó en un día distinto del de hoy. */
export function laSesionQuedoEnOtroDia(
  diaDeLaSesion: string | null | undefined,
  hoy: string,
): boolean {
  const s = String(diaDeLaSesion ?? '').trim();
  // Sin un día de sesión válido no se puede decidir, y no se avisa: inventar un aviso es peor
  // que no darlo.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(hoy)) return false;
  return s !== hoy;
}

/** DD/MM a partir de una fecha ISO, para decirlo en pantalla como lo dice la gente. */
export function diaCorto(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}` : '';
}

/**
 * El texto del aviso, o `null` si no hay nada que avisar.
 *
 * Dice las DOS fechas: sin eso, «recargá» no explica por qué, y quien lleva horas trabajando no
 * tiene cómo saber que lo que ve es de otro día.
 */
export function avisoDeDiaViejo(
  diaDeLaSesion: string | null | undefined,
  hoy: string,
): string | null {
  if (!laSesionQuedoEnOtroDia(diaDeLaSesion, hoy)) return null;
  return `Esta pantalla se abrió el ${diaCorto(String(diaDeLaSesion))} y hoy es ${diaCorto(hoy)}. `
       + 'Lo que cargues acá se guarda en el día que se abrió. Recargá para trabajar el de hoy.';
}
