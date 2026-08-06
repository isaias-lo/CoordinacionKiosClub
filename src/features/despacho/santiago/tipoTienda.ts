export interface TipoBadgeStyle { label: string; bg: string; color: string }

/**
 * Mapea el `tipo` del catálogo de tiendas a un badge (etiqueta + colores) para mostrar en las
 * cards de Bodega. Los valores reales del catálogo son: MALL, STRIPCENTER, TIENDA, oficina, y
 * vacío. `oficina`/vacío no muestran badge (no aporta al armado). Puro y testeable.
 */
export function tipoBadge(rawTipo: string | null | undefined): TipoBadgeStyle | null {
  const t = String(rawTipo ?? '').trim().toUpperCase();
  switch (t) {
    case 'MALL':        return { label: 'Mall',   bg: 'rgba(37,99,235,0.10)',  color: '#1D4ED8' };
    case 'STRIPCENTER': return { label: 'Strip',  bg: 'rgba(13,148,136,0.10)', color: '#0F766E' };
    case 'TIENDA':      return { label: 'Tienda', bg: 'rgba(217,119,6,0.10)',  color: '#B45309' };
    default:            return null; // oficina / vacío / desconocido → sin badge
  }
}
