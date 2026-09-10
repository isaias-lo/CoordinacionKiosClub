/**
 * Constantes visuales compartidas entre los dos `TiendaGridCard` (Regiones/TiendasPage.tsx y
 * Santiago/StepForm.tsx). NO fusiona los componentes — cada uno mantiene su propia lógica
 * (terminada, presencia, drag táctil, picking) — solo comparte los VALORES de estilo para que
 * dejen de divergir con cada edición futura (ej. el ghost de chocolate usaba
 * `rgba(146,64,14,0.40)` en un archivo y `rgba(146,64,14,0.45)`/fondo `rgba(120,53,15,0.06)` en
 * el otro).
 *
 * [Contraste AA, 2026-09-10] Los colores de texto están oscurecidos para pasar 4.5:1 sobre fondo
 * claro a 11px — mismo criterio que ya usa la tab Actividad para sus badges de acción (ver
 * `ActividadScreen.tsx`): `#B45309` es el mismo ámbar oscuro de su badge "Sumó" (en vez de
 * `warn` #FF9500, ~2.2:1); `#15803D` es el mismo verde de su badge "Ingresó" (en vez de
 * `success` #34C759, ~2:1). Los "ghost" (picking pendiente) antes diluían el texto a 40-45% de
 * opacidad, lo que hundía aún más el contraste — ahora el texto queda sólido y solo el fondo/
 * borde punteado quedan tenues, que es la señal visual real de "pendiente".
 */
export const STORE_CARD_BADGE = {
  pallet:     { textCls: 'text-info',      bg: 'rgba(37,99,235,0.12)',  ghostBg: 'rgba(37,99,235,0.06)',  ghostBorderCls: 'border-info/25' },
  bulto:      { textCls: 'text-[#B45309]', bg: 'rgba(217,119,6,0.12)',  ghostBg: 'rgba(217,119,6,0.06)',  ghostBorderCls: 'border-warn/25' },
  contenedor: { textCls: 'text-[#6B21A8]', bg: 'rgba(107,33,168,0.10)', ghostBg: 'rgba(107,33,168,0.06)', ghostBorderCls: 'border-[rgba(107,33,168,0.25)]' },
  // Chocolate va por `style` inline (no clase Tailwind) en ambos archivos — mismo patrón que ya
  // tenían, solo con los valores unificados.
  chocolate:  { color: '#92400E', bg: 'rgba(120,53,15,0.10)', ghostBg: 'rgba(120,53,15,0.06)', ghostBorderColor: 'rgba(120,53,15,0.25)' },
} as const;

/** Verde oscurecido para el "código de tienda" cuando ya tiene guía/PDF cargado — mismo verde
 *  que usa Actividad para su badge "Ingresó" (#15803D, ~5:1 sobre blanco). Antes cada archivo
 *  usaba `text-success` (#34C759, ~2:1) directamente. */
export const STORE_CARD_DONE_TEXT = 'text-[#15803D]';
