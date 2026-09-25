// La ventana de recepción de una tienda. Puro y testeable. UNA sola implementación.
//
// Había DOS `parseVentana` en el proyecto, con campos distintos y criterios distintos:
//
//   planificador.ts   { open, close }    split('-')   no validaba nada
//   enrutadorV2.ts    { abre, cierra }   regex        rechazaba cierra <= abre
//
// Mismo dato, dos verdades. Es el mismo patrón que dejó el chocolate arreglado en un camino y
// roto en el otro: dos copias de la misma regla que se arreglan por separado. Y el parser frágil
// era justo el del Planificador — `split('-')` devuelve null ante cualquier formato que no sean
// exactamente dos partes, y "sin ventana" se trata como "no restringe", así que una ventana mal
// escrita desaparece en silencio en vez de avisar.
//
// Acá queda una, con el criterio del más estricto.

/** Minutos desde medianoche de un "HH:MM". null si no es una hora válida. */
export function aMinutosDelDia(hhmm?: string | null): number | null {
  const m = String(hhmm ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export interface Ventana {
  /** Minutos del día en que abre. */
  abre: number;
  /** Minutos del día en que cierra. */
  cierra: number;
}

/**
 * Un tramo horario, escrito de cualquiera de las formas que usa la operación de verdad:
 *
 *     09:00-12:00     el canónico
 *     09:00 - 12:00   con espacios
 *     09:00 a 12:00   así viene la tabla de congelados, en las 35 filas
 *     08.00 a 12.00   así lo escribió quien cargó Maipú
 *     9:30 a 17:00    hora de un dígito
 *
 * Aceptar " a " y el punto es una RED, no el formato preferido: lo que se guarda pasa antes por
 * `normalizarVentana`. Pero si alguien escribe a mano "9 a 17" en Config, es mejor entenderlo que
 * perderlo en silencio — que es exactamente lo que este archivo vino a evitar.
 */
const TRAMO = /(\d{1,2})[:.](\d{2})\s*(?:[-–—]|\ba\b)\s*(\d{1,2})[:.](\d{2})/i;
const TRAMOS = new RegExp(TRAMO.source, 'gi');

/** "HH:MM" desde horas y minutos sueltos, con el cero adelante. */
const hhmm = (h: string, m: string) => `${h.padStart(2, '0')}:${m}`;

/**
 * Parsea la ventana del catálogo.
 *
 * Si vienen VARIOS tramos ("09:00-12:00 / 15:00-18:00") se toma el PRIMERO: el despacho es de
 * mañana y ese es el que aplica. Una ventana invertida (cierra ≤ abre) se descarta: no es una
 * ventana, es un dato malo, y tratarla como válida haría que todo llegue "tarde".
 */
export function parseVentana(v?: string | null): Ventana | null {
  const m = String(v ?? '').match(TRAMO);
  if (!m) return null;
  const abre = aMinutosDelDia(hhmm(m[1], m[2]));
  const cierra = aMinutosDelDia(hhmm(m[3], m[4]));
  if (abre == null || cierra == null || cierra <= abre) return null;
  return { abre, cierra };
}

// ── Normalizar lo que se escribe a mano ──────────────────────────────────────────
//
// La tabla de congelados llegó con " a " en las 35 filas, puntos en Maipú, horas de un dígito,
// espacios de sobra y tres formas distintas de escribir "sin restricciones" (una de ellas con una
// sola c). Guardada tal cual, `parseVentana` habría devuelto null en todas y las ventanas se
// habrían perdido SIN UN SOLO ERROR.
//
// Por eso lo que se guarda pasa por acá primero, tanto al cargar la tabla como al guardar desde
// Config: en la base queda siempre el canónico.

/** Lo que se guarda cuando la tienda recibe a cualquier hora. */
export const SIN_RESTRICCION = 'SIN RESTRICCIÓN';

export interface VentanaNormalizada {
  /** El valor canónico, listo para guardar. */
  valor: string;
  /** false = no se entendió. Hay que AVISAR, no guardar en silencio. */
  reconocida: boolean;
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Lleva cualquier escritura al canónico `HH:MM-HH:MM`.
 *
 * Tres resultados posibles, y el tercero es el que importa:
 *
 *   · vacío            → `''`                (nadie cargó el dato)
 *   · "sin restricciones" (en cualquiera de sus formas) → `SIN RESTRICCIÓN`
 *   · uno o más tramos → `"09:00-12:00"` / `"08:00-09:00 / 20:00-21:00"`
 *   · nada de lo anterior → se devuelve el texto tal cual con `reconocida: false`
 *
 * Lo que NO hace: inventar. Si no lo entiende lo dice, en vez de dejar la celda en blanco y que la
 * ventana desaparezca sin que nadie se entere.
 *
 * Los varios tramos se conservan (Chillán recibe 08:00-09:00 y 20:00-21:00); `parseVentana` ya sabe
 * quedarse con el de la mañana.
 */
export function normalizarVentana(texto?: string | null): VentanaNormalizada {
  const t = String(texto ?? '').trim();
  if (!t) return { valor: '', reconocida: true };
  if (/sin\s*restri/i.test(sinTildes(t))) return { valor: SIN_RESTRICCION, reconocida: true };

  const tramos: string[] = [];
  for (const m of t.matchAll(TRAMOS)) {
    const abre = aMinutosDelDia(hhmm(m[1], m[2]));
    const cierra = aMinutosDelDia(hhmm(m[3], m[4]));
    if (abre == null || cierra == null || cierra <= abre) continue;   // tramo inválido: no se inventa
    tramos.push(`${hhmm(m[1], m[2])}-${hhmm(m[3], m[4])}`);
  }
  if (!tramos.length) return { valor: t, reconocida: false };
  return { valor: tramos.join(' / '), reconocida: true };
}

export type EstadoVentana = 'ok' | 'temprano' | 'tarde' | 'sin-ventana';

/**
 * Cómo cae una hora de llegada respecto de la ventana.
 * 'temprano' = antes de abrir (se espera) · 'tarde' = después de cerrar · 'sin-ventana' = no restringe.
 */
export function estadoVentana(etaMin: number, ventana?: string | null): EstadoVentana {
  const w = parseVentana(ventana);
  if (!w) return 'sin-ventana';
  if (etaMin < w.abre) return 'temprano';
  if (etaMin > w.cierra) return 'tarde';
  return 'ok';
}

// ── Qué ventana aplica según lo que se reparte ───────────────────────────────────

export type TipoCargaVentana = 'seco' | 'congelados';

/** Lo mínimo que hace falta saber de una tienda para elegir su ventana. */
export interface TiendaConVentanas {
  /** Ventana de SECO. */
  v?: string | null;
  /** Ventana de CONGELADOS. Vacía = no se cargó. */
  vCong?: string | null;
}

/**
 * La ventana que aplica a esta tienda para este tipo de carga.
 *
 * Congelados usa la suya **si la tiene**; si no, cae a la de seco — que es exactamente lo que el
 * sistema hacía antes de que existiera la columna. Así, mientras la tabla esté a medio cargar,
 * nada empeora respecto de hoy: una tienda sin dato se comporta igual que siempre.
 *
 * Ojo con el caso que parece un borde y no lo es: `SIN RESTRICCIÓN` es un valor REAL —significa
 * "recibe a cualquier hora"— así que gana sobre la ventana de seco. Solo el vacío cae.
 */
export function ventanaSegunCarga(t: TiendaConVentanas | undefined, carga: TipoCargaVentana): string {
  const seco = String(t?.v ?? '');
  if (carga !== 'congelados') return seco;
  const cong = String(t?.vCong ?? '').trim();
  return cong || seco;
}

/**
 * El catálogo con la ventana que corresponde ya puesta en `v`.
 *
 * Existe para que el motor no tenga que saber nada de congelados: `ordenarConVentanas` y
 * `factibilidadDia` siguen leyendo `v` como siempre, y acá se decide qué es `v` en este contexto.
 * Para seco devuelve el mismo objeto sin copiar nada.
 */
export function catalogoParaCarga<T extends TiendaConVentanas>(
  tiendas: Record<string, T | undefined>,
  carga: TipoCargaVentana,
): Record<string, T> {
  if (carga !== 'congelados') return tiendas as Record<string, T>;
  const out: Record<string, T> = {};
  for (const [cod, t] of Object.entries(tiendas)) {
    if (!t) continue;
    out[cod] = { ...t, v: ventanaSegunCarga(t, 'congelados') };
  }
  return out;
}

// ── Dureza de la ventana ─────────────────────────────────────────────────────────
//
// Del Colab: un MALL tiene ventana DURA (el andén cierra y no hay negociación) y el resto la tiene
// BLANDA (llegar tarde molesta, pero se recibe).
//
// El Handoff avisa que atar la dureza al formato es frágil (§5.12): «Hay strips con administrador
// estricto y malls flexibles; el formato no es la restricción». Por eso `dureza` se puede pasar
// explícita por tienda y el formato es solo el DEFAULT — cuando exista la columna por tienda,
// entra por acá sin tocar el algoritmo.

export type DurezaVentana = 'dura' | 'blanda';

/** Dureza por defecto según el formato de la tienda. MALL → dura; todo lo demás → blanda. */
export function durezaPorFormato(tipo?: string | null): DurezaVentana {
  return String(tipo ?? '').trim().toUpperCase().includes('MALL') ? 'dura' : 'blanda';
}

/**
 * Minutos que se le restan al cierre para optimizar con colchón (§4.1 del Handoff).
 *
 * Se planifica contra `cierre − buffer` y se VALIDA contra el cierre real: el plan nace con
 * margen, pero los reportes no muestran números inflados. En la corrida del notebook los malls
 * cerraron con 20–23 min de margen real.
 */
export const BUFFER_CIERRE_MIN = 10;

/** El cierre con el que se OPTIMIZA (no el que se muestra). Nunca baja de la apertura. */
export function cierreEfectivo(w: Ventana, buffer = BUFFER_CIERRE_MIN): number {
  return Math.max(w.abre, w.cierra - buffer);
}

/** De dónde salió la ventana que se está mostrando. El compañero de `ventanaSegunCarga`. */
export type OrigenVentana =
  /** Ruta de seco: la ventana de seco es la que corresponde. */
  | 'seco'
  /** Ruta de congelados y la tienda tiene la suya. */
  | 'congelados'
  /** Ruta de congelados y la tienda NO tiene la suya: se está usando la de seco. */
  | 'congelados-cae-a-seco';

/**
 * Cuál de las dos ventanas se terminó usando.
 *
 * `ventanaSegunCarga` devuelve el horario; esto dice de dónde salió. Son dos preguntas distintas y
 * la segunda es la que faltaba en pantalla.
 *
 * El caso que importa: en una ruta de CONGELADOS, una tienda sin ventana propia cae a la de seco.
 * Eso no es un error —es la degradación que se eligió mientras la tabla está a medio cargar— pero
 * hasta ahora solo se sabía pasando el mouse por encima: en la lista se veía un reloj gris, igual
 * que en cualquier ruta de seco. Medido el 25/09: **20 tiendas reciben congelados sin ventana
 * propia, 9 de ellas MALL**, donde la ventana es DURA y el andén cierra. Planificarlas contra el
 * horario de seco manda al chofer a una hora en que la tienda no recibe frío, y nada lo decía.
 *
 * Una tienda sin NINGUNA ventana (60PBL) no cae en este caso: no hay nada que advertir, no hay
 * ventana que esté mal. Se ve como siempre.
 */
export function origenDeVentana(t: TiendaConVentanas | undefined, carga: TipoCargaVentana): OrigenVentana {
  if (carga !== 'congelados') return 'seco';
  if (String(t?.vCong ?? '').trim()) return 'congelados';
  // Sin ventana de seco tampoco no hay nada que advertir: no se está mostrando la ventana equivocada.
  return String(t?.v ?? '').trim() ? 'congelados-cae-a-seco' : 'congelados';
}
