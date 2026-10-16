// «¿Algo se trabó?» en Ayuda: Empezar de cero y Reportar un problema. Puro y testeable.
//
// Nace del 14/10/2026: Kamila quedó atrapada en 59EGN sin forma de salir, y el reporte llegó como
// «atrapada en egn». Dos cosas faltaban: una salida que sirva para CUALQUIER estado trabado (también
// los que todavía no conocemos), y que el aviso llegue con lo que la persona estaba viendo.

/**
 * Lo que Picking guarda en el equipo y SÍ se conserva al empezar de cero: preferencias y trabajo,
 * no estado de navegación.
 *  - picking_label_config_v1: cómo se imprime la etiqueta en esa impresora.
 *  - picking_offline_queue_v1: la cola vieja; si quedó algo, es trabajo sin enviar.
 *  - picking_saved_picker_names: los nombres que se escribieron hoy.
 *  - picking_cols_per_row / picking_left_panel_width: cómo acomodó la pantalla.
 * La cola de verdad está en IndexedDB (src/lib/offline) y esto no la toca.
 */
const SE_CONSERVAN = new Set([
  'picking_label_config_v1',
  'picking_offline_queue_v1',
  'picking_saved_picker_names',
  'picking_cols_per_row',
  'picking_left_panel_width',
]);

/** De todas las claves del almacenamiento, las de Picking que se borran al empezar de cero. */
export function clavesABorrar(claves: string[]): string[] {
  return claves.filter(c => (c.startsWith('picking_') || c.startsWith('pk-')) && !SE_CONSERVAN.has(c));
}

/** Lo que la pantalla sabe en el momento del reporte. Todo opcional: lo que no haya, no va. */
export interface EstadoPicking {
  pestana?: string;
  seccion?: string;
  tiendasElegidas?: string[];
  tiendaActiva?: string | null;
  encargadoAbierto?: string | null;
  vista?: string;
  escritorio?: boolean;
  enLinea?: boolean;
}

export const TEXTO_MAX = 1000;

export type MotivoReporte = 'reporte' | 'empezar-de-cero';

export interface FilaReporte {
  motivo: MotivoReporte;
  texto: string;
  estado: EstadoPicking & { fecha: string; hora: string; pantalla: string; url: string };
  version: string;
  nombre: string | null;
}

/**
 * Arma la fila de `picking_reportes`. Un reporte sin texto no sirve (es lo único que dice qué
 * pasó); empezar de cero sí va sin texto, porque la foto del estado ES el dato.
 */
export function armarReporte(
  motivo: MotivoReporte,
  texto: string,
  estado: EstadoPicking,
  ctx: { fecha: string; ahora: Date; ancho: number; alto: number; url: string; version: string; nombre?: string | null },
): FilaReporte | { error: string } {
  const limpio = texto.trim().slice(0, TEXTO_MAX);
  if (motivo === 'reporte' && !limpio) return { error: 'Cuenta en una frase qué pasó.' };
  return {
    motivo,
    texto: limpio,
    estado: {
      ...estado,
      fecha: ctx.fecha,
      hora: ctx.ahora.toISOString(),
      pantalla: `${ctx.ancho}×${ctx.alto}`,
      url: ctx.url,
    },
    version: ctx.version,
    nombre: ctx.nombre?.trim() || null,
  };
}
