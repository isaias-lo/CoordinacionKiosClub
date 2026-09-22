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

// ── Estado de la tienda: qué color dice qué ──────────────────────────────────────
//
// Antes, "terminada" y "con guía" se pintaban del MISMO verde —el texto era literalmente el mismo
// `#15803D`, y los fondos el mismo verde al 10% y al 7%— y además `terminada` se evaluaba PRIMERO.
// El efecto no era que se parecieran: era que, apenas se marcaba una tienda como terminada, el
// estado de su guía DESAPARECÍA de la tarjeta. No había forma de saber a cuáles les faltaba.
//
// Son dos hechos independientes, así que se reparten en dos canales distintos:
//
//     el COLOR    responde "¿tiene guía?"   → verde sí · ámbar no (y está terminada)
//     la ETIQUETA responde "¿está terminada?" → "✓ TERMINADA"
//
// Así, de un vistazo sobre la grilla, las ámbar son exactamente las que esperan su guía. Y una
// tienda terminada CON guía se ve verde y con etiqueta: las dos cosas a la vez, que antes era
// justamente lo que no se podía ver.
//
// El ámbar es `#B45309`, el mismo que esta app ya usa para su ámbar legible (ver la nota de
// contraste de arriba); `warn` (#FF9500) da ~2.2:1 y no sirve para texto.

export interface EstadoTarjetaTienda {
  /** La tienda abierta ahora mismo. Gana sobre todo lo demás. */
  activa: boolean;
  /** Ya tiene su guía / PDF cargado. */
  conGuia: boolean;
  /** Alguien la marcó como terminada. */
  terminada: boolean;
  /** Está en el calendario de hoy. */
  deHoy: boolean;
}

/** Clases de la TARJETA según su estado. La precedencia vive acá, no duplicada en cada espejo. */
export function claseTarjetaTienda(e: EstadoTarjetaTienda): string {
  if (e.activa)    return 'bg-[rgba(30,64,175,0.12)] border-2 border-[#1E40AF] shadow-sm';
  // La guía gana sobre "terminada": es el dato que el coordinador necesita ver y el que antes
  // quedaba tapado. Que además esté terminada lo dice la etiqueta, no el color.
  if (e.conGuia)   return 'bg-[rgba(22,163,74,0.10)] border-2 border-[#15803D] shadow-sm';
  if (e.terminada) return 'bg-[rgba(217,119,6,0.10)] border-2 border-[#B45309] shadow-sm';
  if (e.deHoy)     return 'bg-[rgba(30,64,175,0.04)] border border-[rgba(30,64,175,0.20)] active:bg-[rgba(30,64,175,0.09)]';
  return 'bg-white border border-border active:bg-bg';
}

/** Color del CÓDIGO de tienda, en el mismo orden de precedencia que la tarjeta. */
export function claseCodigoTienda(e: EstadoTarjetaTienda): string {
  if (e.activa)    return 'text-[#1E40AF]';
  if (e.conGuia)   return STORE_CARD_DONE_TEXT;
  if (e.terminada) return 'text-[#B45309]';
  return 'text-navy';
}

/** Color de la etiqueta "✓ TERMINADA": acompaña al color de la tarjeta para no desentonar. */
export function claseEtiquetaTerminada(e: EstadoTarjetaTienda): string {
  return e.conGuia ? 'text-[#15803D]' : 'text-[#B45309]';
}
