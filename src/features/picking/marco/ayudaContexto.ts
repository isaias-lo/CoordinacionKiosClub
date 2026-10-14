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
