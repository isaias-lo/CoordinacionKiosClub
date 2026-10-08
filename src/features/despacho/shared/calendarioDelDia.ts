// Qué tiendas estaban PLANIFICADAS para un día, según el calendario. PURO.
//
// ── PARA QUÉ ──────────────────────────────────────────────────────────────────────────────────
//
// El 07/10/2026 apareció 38SP2 en CRUCE PESOS y el coordinador preguntó lo obvio: «si no estaba
// en el calendario de hoy, ¿la app no debería tenerlo en cuenta?».
//
// La respuesta es que el calendario NO debe FILTRAR el cruce. El calendario es el PLAN y Odoo es
// el HECHO: si se filtran los hechos por el plan, desaparece en silencio justo lo que más importa
// ver —una tienda a la que el CD despachó sin estar planificada—. Lo que sí corresponde es
// MARCARLA, para que la fila diga por qué está ahí en vez de dejar a alguien investigando.
//
// ── LA FORMA DEL CALENDARIO ───────────────────────────────────────────────────────────────────
//
// `calendario_central` guarda UNA fila (`id = 'current'`) con la semana entera: una clave por día
// —DO, LU, MA, MI, JU, VI, SA— y dentro tres listas de códigos, `rm`, `fal` y `costa`. No es por
// fecha: es la rutina semanal. El 07/10 cayó miércoles, y 38SP2 no estaba en el `fal` del
// miércoles — la marca lo habría dicho de una.
//
// ── LO QUE ESTA FUNCIÓN NO PUEDE SABER, Y POR ESO NO LO AFIRMA ────────────────────────────────
//
// Bodega permite agregar y quitar tiendas de un día puntual, y parte de eso vive en el
// `localStorage` del dispositivo (`calendarExtra_<fecha>` / `calendarRemoved_<fecha>`): desde el
// servidor NO se ve. Los ADELANTOS sí quedan en `tiendas_adelanto` y acá se suman.
//
// Por eso un «No» significa «no estaba en la rutina semanal ni entre los adelantos», que es una
// señal útil, y NO significa «nadie la agregó nunca». La diferencia está escrita en el rótulo que
// va a la hoja, para que nadie la lea de más.

/** Las claves del calendario, en el orden de `Date.getDay()` (0 = domingo). */
export const CLAVES_POR_DIA = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'] as const;

/** Las tres zonas en que el calendario parte cada día. */
const ZONAS = ['rm', 'fal', 'costa'] as const;

/** La forma de `calendario_central.data`: una clave por día, y dentro las tres zonas. */
export type CalendarioSemanal = Record<string, Partial<Record<string, unknown>>>;

/**
 * La clave del calendario para una fecha ISO (YYYY-MM-DD).
 *
 * Se parte el string en vez de usar `new Date(iso)`, que interpreta la fecha como UTC y en Chile
 * devuelve el día ANTERIOR — el mismo tropiezo que documenta `todayISO()`.
 */
export function claveDelDia(fechaISO: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaISO);
  if (!m) return null;
  const dia = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay();
  return CLAVES_POR_DIA[dia] ?? null;
}

function normalizar(cod: unknown): string {
  return String(cod ?? '').trim().toUpperCase();
}

/**
 * Los códigos planificados para esa fecha: la rutina semanal más los adelantos de ese día.
 *
 * Devuelve `null` —y no un conjunto vacío— cuando no se pudo leer el calendario. Un vacío diría
 * «ese día no había ninguna tienda», que es una afirmación distinta: con `null` la marca se deja
 * en blanco en vez de poner «No» en todas las filas.
 */
export function tiendasPlanificadas(
  calendario: CalendarioSemanal | null | undefined,
  fechaISO: string,
  adelantos: readonly string[] = [],
): Set<string> | null {
  const clave = claveDelDia(fechaISO);
  const delDia = clave ? calendario?.[clave] : undefined;
  if (!delDia) return null;

  const out = new Set<string>();
  for (const zona of ZONAS) {
    const lista = delDia[zona];
    if (Array.isArray(lista)) for (const c of lista) { const n = normalizar(c); if (n) out.add(n); }
  }
  for (const c of adelantos) { const n = normalizar(c); if (n) out.add(n); }
  return out;
}

/** Lo que va en la columna EN CALENDARIO. Vacío cuando no se pudo saber. */
export function marcaDeCalendario(
  planificadas: Set<string> | null,
  cod: string,
): string {
  if (!planificadas) return '';
  return planificadas.has(normalizar(cod)) ? 'Sí' : 'No';
}
