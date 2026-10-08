// Las siete pestañas de Picking y cómo se agrupan en el menú lateral. Puro y testeable.
//
// La clave de cada una es la que guarda `usePestanaRecordada('picking_tab')`: no se cambian, para
// que quien recargue vuelva a la misma pestaña que tenía antes del rediseño.

export type PestanaPicking =
  | 'monitoreo' | 'congelados' | 'actividad' | 'historial' | 'estadisticas' | 'configuracion' | 'calendario';

export type GrupoPestanas = 'Operación' | 'Seguimiento' | 'Ajustes';

export interface Pestana { key: PestanaPicking; label: string; grupo: GrupoPestanas }

/** En el orden del menú lateral (diseño «Picking, propuesta empresarial»). */
export const PESTANAS: Pestana[] = [
  { key: 'monitoreo',     label: 'Seco',          grupo: 'Operación'   },
  { key: 'congelados',    label: 'Congelados',    grupo: 'Operación'   },
  { key: 'actividad',     label: 'Actividad',     grupo: 'Seguimiento' },
  { key: 'historial',     label: 'Historial',     grupo: 'Seguimiento' },
  { key: 'estadisticas',  label: 'Estadísticas',  grupo: 'Seguimiento' },
  { key: 'calendario',    label: 'Calendario',    grupo: 'Ajustes'     },
  { key: 'configuracion', label: 'Configuración', grupo: 'Ajustes'     },
];

export const GRUPOS: GrupoPestanas[] = ['Operación', 'Seguimiento', 'Ajustes'];

export function pestana(key: PestanaPicking): Pestana {
  return PESTANAS.find(p => p.key === key) ?? PESTANAS[0];
}

/** «Miércoles 8 oct», como la franja superior del diseño. */
export function fechaCorta(d: Date): string {
  const dia = d.toLocaleDateString('es-CL', { weekday: 'long' });
  const mes = d.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '');
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${d.getDate()} ${mes}`;
}

/** Texto de la píldora de conexión. Con señal y sin nada en la cola, «todo guardado». */
export function textoConexion(online: boolean, pendientes: number): string {
  const n = pendientes === 1 ? '1 pendiente' : `${pendientes} pendientes`;
  if (online) return pendientes > 0 ? `En línea · ${n} por enviar` : 'En línea · todo guardado';
  return pendientes > 0 ? `Sin conexión · ${n}` : 'Sin conexión';
}

/** Versión corta para teléfono y handheld, donde la franja no tiene espacio para la frase entera. */
export function textoConexionCorto(online: boolean, pendientes: number): string {
  if (online) return pendientes > 0 ? `${pendientes} por enviar` : 'En línea';
  return pendientes > 0 ? `Sin conexión · ${pendientes}` : 'Sin conexión';
}
