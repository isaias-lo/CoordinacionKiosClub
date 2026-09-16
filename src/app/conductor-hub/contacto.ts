/**
 * [Panel Conductor · Fase 6] Navegación y llamada con un toque — el patrón que ya usan Amazon
 * Flex/Onfleet: tocar la dirección abre la app de mapas con la ruta calculada; tocar el teléfono
 * llama directo. Puro y testeable, separado de `page.tsx` (que renderiza los links).
 */

/**
 * Link de navegación. Prefiere lat/lon reales (`tiendas.lat/lon`, ya existían sin usarse en
 * ningún lado) sobre la dirección en texto: no dependen de que Google entienda una dirección
 * chilena mal escrita. `maps.google.com/dir/?api=1` es el esquema universal que Android e iOS
 * resuelven a la app de mapas que el usuario tenga por defecto — a diferencia de un esquema
 * `geo:`, que en iOS no abre nada si no hay una app que lo maneje.
 */
export function linkNavegacion(a: { lat?: number | null; lon?: number | null; direccion?: string | null; comuna?: string | null }): string | null {
  if (a.lat != null && a.lon != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lon}`;
  }
  const texto = [a.direccion, a.comuna].filter(Boolean).join(', ');
  return texto ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(texto)}` : null;
}

/** `tel:` con el teléfono saneado (solo dígitos y el `+` inicial) — `tiendas.tel_encargado` viene
 *  con formatos libres ("+56 9 8384 9612", "56962946532", a veces vacío). */
export function linkLlamar(tel?: string | null): string | null {
  if (!tel?.trim()) return null;
  const saneado = tel.trim().replace(/(?!^\+)[^\d]/g, '');
  return saneado ? `tel:${saneado}` : null;
}
