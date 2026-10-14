// Qué día está trabajando la pantalla de Bodega. PURO.
//
// ── EL CASO DEL 13/10/2026 ────────────────────────────────────────────────────────────────────
//
// Llovió, el CD cerró antes de terminar el turno y quedaron 51 unidades sin pesar en ~30 tiendas.
// Al día siguiente Bodega abre el 14, arma su lista con el calendario del miércoles, y esas
// unidades —que existen, que están pesándose a medias y que tienen su etiqueta pegada— no
// aparecen por ningún lado. No se borraron: se volvieron invisibles.
//
// ── POR QUÉ EL TRABAJO CONSERVA SU DÍA Y NO SE MUEVE AL SIGUIENTE ─────────────────────────────
//
// Existe un camino para traer un pallet de otro día a la carga de hoy —reclamar un preexistente,
// que re-data el slot conservando el `canonical_id`— y para un pallet adelantado suelto está
// bien. Para un turno entero NO:
//
//   1. El `id` de la fila de la planilla lleva el sello del día de DESPACHO. Mover medio turno
//      genera un segundo juego de filas para los mismos pallets físicos.
//   2. CRUCE PESOS compara los movimientos de Odoo de un día contra lo que Bodega pesó ESE día.
//      Odoo movió esa mercadería el 13: si la mitad de los pesos cae en el 14, el cruce del 13
//      queda corto y el del 14 largo, en treinta tiendas a la vez.
//
// Así que el día se conserva y lo que cambia es la pantalla: se puede volver a trabajar el 13.
// `fechaDespachoBodega` también se calcula desde ese día (13 → despacho 14), o el registro
// estrenaría un sello distinto y duplicaría las filas.
//
// ── POR QUÉ NO ES UN SELECTOR LIBRE ───────────────────────────────────────────────────────────
//
// Bodega la usan ocho personas en handheld. Un día equivocado escribe carga en otro día SIN que
// nadie lo note — es exactamente lo que pasó el 12/10 con una pestaña abierta desde el viernes
// (ver `diaDeLaSesion.ts`): 19 pallets y 6 bultos fantasma. Por eso el día no se teclea: llega por
// la URL, se valida contra una ventana corta, y mientras no sea hoy hay una banda que no se puede
// pasar por alto.

/** Cuántos días hacia atrás se admite trabajar. Más que esto es un error de tipeo, no una jornada. */
export const MAX_DIAS_ATRAS = 7;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** El `?dia=AAAA-MM-DD` de una query string, o `null` si no viene. No valida: solo extrae. */
export function diaPedidoEnURL(search: string | null | undefined): string | null {
  const s = String(search ?? '');
  const m = /[?&]dia=([^&]+)/.exec(s);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).trim() || null;
  } catch {
    return null;
  }
}

/** Días de diferencia entre dos fechas ISO. Positivo si `a` es posterior a `b`. */
function diasEntre(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  // `Date.UTC` sobre números de calendario: no depende del huso del equipo ni cruza medianoche.
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000);
}

/**
 * ¿Se puede trabajar ese día? Hoy sí; un día pasado dentro de la ventana, sí. El futuro NUNCA:
 * escribir carga en un día que no llegó es inventarla, y es el error que más caro sale.
 */
export function diaDeTrabajoAdmitido(
  dia: string | null | undefined, hoy: string, maxAtras = MAX_DIAS_ATRAS,
): boolean {
  const d = String(dia ?? '').trim();
  if (!ISO.test(d) || !ISO.test(hoy)) return false;
  const delta = diasEntre(d, hoy);
  return delta <= 0 && delta >= -maxAtras;
}

/**
 * El día que la pantalla va a trabajar. Ante cualquier duda, HOY: un día pedido que no se entiende
 * se descarta en silencio en vez de abrir una jornada cualquiera.
 */
export function resolverDiaDeTrabajo(
  pedido: string | null | undefined, hoy: string, maxAtras = MAX_DIAS_ATRAS,
): string {
  return diaDeTrabajoAdmitido(pedido, hoy, maxAtras) ? String(pedido).trim() : hoy;
}

/** `true` si la pantalla NO está en el día de hoy — lo único que dispara la banda. */
export function esOtroDia(dia: string | null | undefined, hoy: string): boolean {
  const d = String(dia ?? '').trim();
  if (!ISO.test(d) || !ISO.test(hoy)) return false;
  return d !== hoy;
}

/** «martes 13 de octubre», para que la banda lo diga como lo dice la gente. */
export function diaEnPalabras(iso: string): string {
  if (!ISO.test(String(iso ?? ''))) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * La URL de esta misma pantalla con otro día, o sin ninguno para volver a hoy.
 *
 * Se devuelve la dirección completa y no un `router.push` a propósito: cambiar de día tiene que
 * recargar la página entera. Las claves de `localStorage`, el estado compartido y la lista de
 * tiendas se fijan al cargar, y una navegación del cliente las dejaría mezcladas entre dos días.
 */
export function urlConDia(ruta: string, dia: string | null): string {
  const base = String(ruta ?? '').split('?')[0];
  return dia ? `${base}?dia=${encodeURIComponent(dia)}` : base;
}
