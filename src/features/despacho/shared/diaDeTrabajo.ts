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

// ── QUE TODAS LAS PIEZAS DE UNA CARGA TRABAJEN EL MISMO DÍA ───────────────────────────────────
//
// `urlConDia` (arriba) explica que cambiar de día tiene que RECARGAR la página entera, porque las
// claves de `localStorage`, el estado compartido y la lista de tiendas se fijan al cargar. Eso es
// cierto y el botón de la banda lo respeta. Lo que faltaba es la defensa para cuando la URL
// cambia por cualquier OTRA vía: un enlace del menú, el botón atrás, una navegación interna.
//
// ── POR QUÉ HACÍA FALTA: LAS TIENDAS FANTASMA DEL 12 Y DEL 19/10 ──────────────────────────────
//
// El día se resuelve leyendo la URL en el instante en que se evalúa cada módulo, y hay SEIS
// módulos que lo hacen por su cuenta. No se evalúan juntos:
//
//   · `AppContext` cuelga de `providers.tsx`, en la raíz → primera carga de CUALQUIER página.
//   · `SantiagoContext` se monta en `/despacho` → al abrir el Enrutador.
//   · `AppScreen`/`TiendasPage` y `SantiagoScreen`/`StepForm` llegan por `dynamic({ssr:false})`
//     → recién al entrar a cada bodega.
//
// Entre un momento y otro la URL puede cambiar sin recargar nada. Ahí los días se parten: el
// contexto se queda en un día y la pantalla que ESCRIBE queda en otro. El 19/10 eso dejó seis
// filas en `despacho_sesion` con fecha de hoy y los conteos del viernes — las mismas seis tiendas
// que el 12/10, y por el mismo camino.
//
// La decisión se deja acá, pura: `diaDeTrabajoActual.ts` solo mira el navegador y obedece.

/** El día que quedó fijado la primera vez que una pieza de esta carga lo resolvió. */
export interface DiaFijado {
  /** El día resuelto. Es el que TODAS las piezas de esta carga tienen que usar. */
  dia: string;
  /** El `?dia=` con que se fijó, ya recortado. `null` = la URL no pedía ninguno. */
  pedido: string | null;
}

export interface DecisionDeDia {
  /** El día que debe usar quien pregunta: siempre el ya fijado, si lo había. */
  dia: string;
  /** Lo que hay que guardar como fijado, o `null` si ya estaba y no cambia. */
  fijar: DiaFijado | null;
  /** La URL pide otro día que el fijado: hay que recargar la página entera. */
  recargar: boolean;
}

/**
 * Qué día usar, y si la carga quedó partida entre dos.
 *
 * La primera pieza que pregunta fija el día; las demás heredan ESE valor aunque su módulo se
 * evalúe más tarde y la URL ya diga otra cosa. Así ninguna pieza escribe en un día distinto del
 * que la pantalla está mostrando.
 *
 * Cuando la URL sí pide otro día, no se cambia el valor en caliente —eso es justo lo que deja la
 * pantalla a mitad de camino—: se pide RECARGAR, y al volver a cargar las seis piezas se fijan
 * juntas desde la misma URL.
 */
export function decidirDiaDeTrabajo(
  fijado: DiaFijado | null,
  pedidoEnURL: string | null | undefined,
  hoy: string,
  maxAtras = MAX_DIAS_ATRAS,
): DecisionDeDia {
  const pedido = String(pedidoEnURL ?? '').trim() || null;

  if (!fijado) {
    const dia = resolverDiaDeTrabajo(pedido, hoy, maxAtras);
    return { dia, fijar: { dia, pedido }, recargar: false };
  }

  // Se mira si cambió lo que PIDE la URL, no el reloj. Una pestaña que cruza la medianoche sigue
  // en su día y se avisa con `AvisoDiaViejo` (#722); recargarla le borraría la pantalla a alguien
  // que está trabajando, que es peor que el problema.
  if (pedido === fijado.pedido) return { dia: fijado.dia, fijar: null, recargar: false };

  // Cambió el pedido, pero puede resolver al MISMO día: un `?dia=` del futuro, mal escrito o
  // fuera de la ventana cae en hoy igual que no traer ninguno. Comparar el resuelto —y no el
  // crudo— es lo que evita un bucle de recargas que nunca converge.
  const resuelto = resolverDiaDeTrabajo(pedido, hoy, maxAtras);
  return { dia: fijado.dia, fijar: null, recargar: resuelto !== fijado.dia };
}
