// Ayudas dentro de la pantalla de Picking: el «?» al lado de lo que confunde y la franja azul con la
// regla de cada pestaña. Puro y testeable. Vive al lado de `ayuda.ts` (la guía completa) para que
// una regla nueva se escriba en un solo lugar: el «?» la resume y la guía la cuenta entera.
//
// Pedido de Isaias del 14/10/2026, después del caso 20CTC: la regla «para un pallet con dos
// categorías, cuéntalo en Todas» tiene que estar donde la persona cuenta, no solo en la guía.

export interface Ayudita { titulo: string; lineas: string[] }

export const AYUDITAS = {
  unidades: {
    titulo: 'Contar unidades',
    lineas: [
      'Cada + es una unidad con su propio número y su propia etiqueta.',
      'Si una etiqueta se dañó, usa Reimprimir: no sumes otra unidad.',
      'El − pide confirmar si esa unidad ya se imprimió.',
    ],
  },
  nombre: {
    titulo: 'Nombre en la etiqueta',
    lineas: [
      'Es el nombre que sale impreso. Escribe el nombre real de quien armó el pallet.',
      'Si lo dejas vacío, se usa el nombre que trae Odoo.',
    ],
  },
  batch: {
    titulo: 'Batch',
    lineas: [
      'Es la Transferir Agrupación de Odoo. Si Odoo lo trae, se usa ese.',
      'Si no viene, escribe solo el número: se imprime como BATCH/número.',
    ],
  },
  peso: {
    titulo: 'Peso total',
    lineas: [
      'Las cajas de chocolate y de congelado se pesan todas juntas: anota el total y se reparte entre las cajas.',
      'Si cambias la cantidad de cajas, hay que volver a pesar.',
    ],
  },
  vistaPrevia: {
    titulo: 'Imprimir y reimprimir',
    lineas: [
      'Imprimir saca todas las etiquetas del encargado. Toca una etiqueta para imprimir solo esa.',
      'Una reimpresión sale como COPIA con el mismo número. Úsala solo si la etiqueta se dañó o se perdió.',
    ],
  },
  operaciones: {
    titulo: 'Operaciones en Odoo',
    lineas: [
      'Son las operaciones de Odoo de este encargado. Las etiquetas se imprimen cuando Odoo las marca como hechas.',
      'El botón de flecha vuelve a leer esa operación desde Odoo.',
      'Si la tabla no cabe, deslízala de lado para ver el estado y el batch.',
    ],
  },
  conexion: {
    titulo: 'Conexión',
    lineas: [
      '«En línea · todo guardado» significa que no queda nada por enviar.',
      'Sin señal puedes seguir contando e imprimiendo: lo pendiente se envía solo al volver la conexión.',
      'No borres los datos del navegador mientras haya pendientes.',
    ],
  },
  errores: {
    titulo: 'Posibles errores',
    lineas: [
      'Marca un pallet que se creó y se borró en poco rato.',
      'Puede estar bien, pero conviene revisar que no falte una etiqueta ni sobre un pallet.',
    ],
  },
  configuracion: {
    titulo: 'Configuración',
    lineas: [
      'Lo que cambies aquí cambia todas las etiquetas que se impriman desde ahora, y se guarda solo.',
    ],
  },
  calendario: {
    titulo: 'Calendario',
    lineas: [
      'Es el calendario de despacho de solo lectura. Se edita en Control interno.',
      '«Usar tiendas de hoy» marca las tiendas que despachan hoy.',
    ],
  },
} as const satisfies Record<string, Ayudita>;

export type TemaAyudita = keyof typeof AYUDITAS;

const NOMBRE: Record<string, string> = { comida: 'Comida', aseo: 'Aseo', hogar: 'Hogar' };

/**
 * La regla de la pestaña de sección que se está mirando, o `null` si no hay nada que avisar.
 * Sale de `cargaDePalletNuevo` (picking-secciones.ts): dentro de Comida, Aseo u Hogar el pallet es
 * de esa sección; en Todas lleva todo el grupo.
 */
export function textoFranja(seccion: string | null | undefined): string | null {
  if (!seccion) return null;
  if (seccion === 'all') return 'Un pallet contado en Todas lleva todas las categorías del encargado. Úsalo para armar un pallet mixto.';
  const nombre = NOMBRE[seccion];
  if (nombre) return `Lo que cuentes en ${nombre} sale con etiqueta de ${nombre}. Si un pallet lleva dos categorías juntas, cuéntalo en Todas.`;
  if (seccion === 'chocolates') return 'Lo que cuentes aquí sale como chocolate, aunque el encargado tenga otras categorías.';
  return null;
}

/** Llave para recordar que la franja de una sección se cerró ese día (vuelve al día siguiente). */
export function claveFranjaCerrada(seccion: string, fecha: string): string {
  return `pk-franja:${fecha}:${seccion}`;
}

/** Nombre del evento con que un «?» pide abrir la guía completa. */
export const EVENTO_ABRIR_GUIA = 'pk-abrir-guia';

export interface Caja { left: number; top: number; right: number; bottom: number }
/** `altoMax`: lo más alta que puede ser sin salirse; si el texto es más largo, se desliza adentro. */
export interface PosBurbuja { x: number; y: number; flecha: number; arriba: boolean; altoMax: number }

/**
 * Dónde va la burbuja del «?» en computador, para que quepa entera en la pantalla. PURA.
 *
 * 14/10/2026: en el panel del encargado, la del Batch (a la derecha) se salía del panel y quedaba
 * cortada a la mitad. Ahora se pone fija sobre la pantalla: debajo del botón, corrida hacia adentro
 * si no cabe a lo ancho, y arriba del botón si no cabe abajo. La flecha sigue apuntando al «?».
 *
 * 15/10/2026: en una pantalla baja no cabía ni arriba ni abajo y quedaba colgando bajo el borde.
 * Ahora va al lado con más espacio y su alto se limita a ese espacio (el resto se desliza).
 */
export function posicionBurbuja(
  boton: Caja, pantalla: { ancho: number; alto: number }, burbuja: { ancho: number; alto: number }, margen = 12,
): PosBurbuja {
  const centro = (boton.left + boton.right) / 2;
  const maxX = Math.max(margen, pantalla.ancho - burbuja.ancho - margen);
  const x = Math.min(Math.max(boton.left - 10, margen), maxX);
  const espacioAbajo = pantalla.alto - margen - (boton.bottom + 8);
  const espacioArriba = boton.top - 8 - margen;
  const cabeAbajo = burbuja.alto <= espacioAbajo;
  const cabeArriba = burbuja.alto <= espacioArriba;
  const arriba = !cabeAbajo && (cabeArriba || espacioArriba > espacioAbajo);
  const altoMax = Math.max(0, arriba ? espacioArriba : espacioAbajo);
  const alto = Math.min(burbuja.alto, altoMax);
  const y = arriba ? boton.top - 8 - alto : boton.bottom + 8;
  const flecha = Math.min(Math.max(centro - x - 6, 10), burbuja.ancho - 22);
  return { x: Math.round(x), y: Math.round(y), flecha: Math.round(flecha), arriba, altoMax: Math.floor(altoMax) };
}
