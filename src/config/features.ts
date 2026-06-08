/**
 * Colores canónicos por feature/módulo.
 * Usarlos en hubs, sidebars, KpiCards y cualquier decoración de color de módulo.
 * Cambiar aquí afecta todo el sistema.
 */
export const FEATURE_COLORS = {
  despacho:         '#2563EB',
  enrutador:        '#16A34A',
  nacional:         '#0891B2',
  rmCosta:          '#7C3AED',
  conteo:           '#0891B2',
  flota:            '#EA580C',
  estado:           '#D97706',
  choferes:         '#7C3AED',
  conductorHub:     '#0891B2',
  operaciones:      '#D97706',
  tiendas:          '#059669',
  historial:        '#6B7280',
  registros:        '#6B7280',
  incidencias:      '#EF4444',
  auditoria:        '#D97706',
  auditoriaAdmin:   '#7C3AED',
  recepcion:        '#059669',
  validacion:       '#4F46E5',
  controlInterno:   '#10B981',
  picking:          '#F59E0B',
  config:           '#4F46E5',
  configTiendas:    '#D42B2B',
  admin:            '#1B2A6B',
} as const;

export type FeatureColorKey = keyof typeof FEATURE_COLORS;

/** Helper para obtener el color de fondo tenue de un módulo (8% opacidad) */
export function featureBg(key: FeatureColorKey): string {
  return `${FEATURE_COLORS[key]}14`;
}
